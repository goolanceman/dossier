import "server-only";

import { z } from "zod";

import { Prisma, type JobSearchProfile } from "@/generated/prisma/client";
import { AssessmentDecision, RunStatus } from "@/generated/prisma/enums";
import type { ScreenPosting } from "@/lib/ai/task-contracts";
import { searchPostings } from "@/lib/job-search";
import { credentialsFor, loadJobSearchConfig, requestContext } from "@/lib/job-search/config";
import { JobSearchError } from "@/lib/job-search/errors";
import { postingKey, type FoundPosting, type SearchPage } from "@/lib/job-search/search";
import type { JobContext } from "@/lib/jobs/runner";
import { logServerError } from "@/lib/log";
import { prisma } from "@/lib/prisma";

import { loadExternalSources } from "./external";
import { deterministicFilter, duplicateFinder, reasonText, type ProfileWithCriteria } from "./filters";
import { EMPTY_MATCHES, keywordMatch, type KeywordMatches } from "./keyword";
import { criteriaFrom, profileQuerySchema, type DiscoveryStage, type ProfileCriteria, type ProfileQuery } from "./profile";

// The discovery pipeline (master.md §2.4): stage 0 fetches, stage 1 filters
// deterministically, stage 2 matches keywords, and stages 3 and 4 are the
// AI the wiring injects (screen, then a full assessment). Every stage can
// be left out, nothing is ever discarded without a recorded reason, and a
// run's counts land in its DiscoveryRun row.

/** What the cheap screen (stage 3) returns; a ScreenPosting from task-contracts satisfies it. */
export type ScreenVerdict = ScreenPosting["verdict"];
export type ScreenFn = (posting: FoundPosting, context: { signal: AbortSignal }) => Promise<{ verdict: ScreenVerdict; reasons: string[]; confidence?: string }>;

/** What the full assessment (stage 4) returns for a stored posting. */
export type AssessFn = (
  postingId: string,
  input: { posting: FoundPosting; criteria: ProfileCriteria; keywords: KeywordMatches; signal: AbortSignal },
) => Promise<{
  decision: Exclude<AssessmentDecision, "PENDING">;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  assessedWith?: string;
  dimensions?: unknown;
  requirements?: unknown;
  critique?: unknown;
}>;

export type PipelineInput = { profileId: string; manual: boolean; screen?: ScreenFn; assess?: AssessFn };

/** What one run did, stage by stage; the job's result and the run row's stats. */
export const runStatsSchema = z.object({
  /** Postings the source returned. */
  fetched: z.number().int().min(0),
  /** Of those, the ones seen before, in this run or an earlier one. */
  duplicates: z.number().int().min(0),
  /** Rejected by the deterministic filters, each with a recorded reason. */
  deterministicRejected: z.number().int().min(0),
  /** Sent to the cheap screen (stage 3). */
  screened: z.number().int().min(0),
  /** Through the screen, on their way to assessment. */
  shortlisted: z.number().int().min(0),
  /** Fully assessed (stage 4). */
  assessed: z.number().int().min(0),
  /** Screen or assessment calls that failed; the run goes on without them. */
  failed: z.number().int().min(0),
  /** What to tell the user. */
  message: z.string(),
});
export type RunStats = z.output<typeof runStatsSchema>;

/** A problem the user can fix, worded for them; the run ends failed with it. */
class DiscoveryProblem extends Error {
  override name = "DiscoveryProblem";
}

// A description below this many characters can't be assessed, and a run
// reads at most three pages, so one profile can't drown the AI stages.
const KEYWORD_SHORTLIST_SCORE = 50;
const MAX_PAGES = 3;
const PAGE_TARGET = 200;

type SurvivingPosting = { id: string; posting: FoundPosting; keywords: KeywordMatches };

type AssessmentWrite = {
  stage: DiscoveryStage;
  decision: AssessmentDecision;
  reasons: string[];
  rejectedReason?: string;
  score?: number;
  confidence?: string;
  assessedWith?: string;
  dimensions?: Prisma.InputJsonValue;
  requirements?: Prisma.InputJsonValue;
  critique?: Prisma.InputJsonValue;
};

/**
 * One row per posting (the schema's unique), rewritten by each run but
 * keeping the best full assessment: a stage before assessment, or a lower
 * score, never replaces a finished one.
 */
async function writeAssessment(postingId: string, profileId: string, write: AssessmentWrite): Promise<void> {
  const existing = await prisma.jobAssessment.findUnique({ where: { postingId }, select: { stage: true, score: true } });
  if (existing?.stage === "ASSESSED" && (write.stage !== "ASSESSED" || (write.score !== undefined && existing.score !== null && write.score < existing.score))) return;
  const data = {
    profileId,
    stage: write.stage,
    decision: write.decision,
    reasons: write.reasons,
    rejectedReason: write.rejectedReason ?? "",
    score: write.score ?? null,
    confidence: write.confidence ?? "",
    assessedWith: write.assessedWith ?? "",
    // Nullable JSON columns want Prisma's DbNull/JsonNull, not a bare null (Prisma 7).
    dimensions: write.dimensions === undefined ? Prisma.DbNull : (write.dimensions as Prisma.InputJsonValue),
    requirements: write.requirements === undefined ? Prisma.DbNull : (write.requirements as Prisma.InputJsonValue),
    critique: write.critique === undefined ? Prisma.DbNull : (write.critique as Prisma.InputJsonValue),
  };
  await prisma.jobAssessment.upsert({ where: { postingId }, create: { postingId, ...data }, update: data });
}

/** Stores a discovered posting, as Find jobs stores its (src/lib/postings.ts): refreshed, but a whole description is never replaced by a snippet. */
async function storeDiscoveredPosting(found: FoundPosting) {
  return prisma.$transaction(async (tx) => {
    const where = { source_externalId: { source: found.source, externalId: found.externalId } };
    const existing = await tx.posting.findUnique({ where, select: { complete: true } });
    const { source, externalId, description, complete, ...rest } = found;
    const fields = { ...rest, postedAt: found.postedAt ? new Date(found.postedAt) : null };
    const text = existing?.complete && !complete ? {} : { description, complete };
    return tx.posting.upsert({
      where,
      create: { source, externalId, ...fields, description, complete },
      update: { ...fields, ...text },
    });
  });
}

/** The postingKeys of this page's postings that an earlier run already assessed, so they count as seen. */
async function assessedKeys(postings: readonly FoundPosting[]): Promise<string[]> {
  if (postings.length === 0) return [];
  const stored = await prisma.posting.findMany({
    where: { OR: postings.map(({ source, externalId }) => ({ source, externalId })) },
    select: { id: true, source: true, externalId: true },
  });
  if (stored.length === 0) return [];
  const assessed = await prisma.jobAssessment.findMany({ where: { postingId: { in: stored.map(({ id }) => id) } }, select: { postingId: true } });
  const ids = new Set(assessed.map(({ postingId }) => postingId));
  return stored.filter(({ id }) => ids.has(id)).map(postingKey);
}

function readQuery(profile: JobSearchProfile): ProfileQuery {
  const result = profileQuerySchema.safeParse(profile.query);
  if (!result.success) throw new DiscoveryProblem("The profile's saved search can't be read. Open the profile and save it again.");
  return result.data;
}

/** Stage 0: the postings the profile's source answers with, external when the query names one. */
async function fetchPostings(profile: JobSearchProfile, query: ProfileQuery, context: Pick<JobContext, "signal">): Promise<FoundPosting[]> {
  if (query.externalSourceId) {
    const sources = await loadExternalSources();
    const source = sources.find((candidate) => candidate.id === query.externalSourceId);
    if (!source) throw new DiscoveryProblem(`The external source "${query.externalSourceId}" isn't set up or is off.`);
    const page = await source.search(query, { signal: context.signal, maxResults: PAGE_TARGET });
    return page.postings;
  }
  const config = await loadJobSearchConfig();
  const credentials = credentialsFor(config, profile.source);
  const postings: FoundPosting[] = [];
  let next: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result: SearchPage = await searchPostings(profile.source, credentials, query, next, requestContext(profile.source));
    postings.push(...result.postings);
    next = result.next;
    if (!next || postings.length >= PAGE_TARGET || context.signal.aborted) break;
  }
  return postings;
}

function statsMessage(stats: Omit<RunStats, "message">): string {
  if (stats.fetched === 0) return "The search found no postings this time.";
  const failed = stats.failed > 0 ? `, ${stats.failed} failed` : "";
  return `Found ${stats.fetched} ${stats.fetched === 1 ? "posting" : "postings"}: ${stats.duplicates} seen before, ${stats.deterministicRejected} filtered out, ${stats.shortlisted} shortlisted, ${stats.assessed} assessed${failed}.`;
}

/**
 * One run of one profile. The AI stages come in through `screen` and
 * `assess` (the wiring sets them; without them, shortlisting falls back to
 * the keyword score and assessments stay pending). A run is idempotent
 * enough to retry: postings upsert, assessments rewrite, the run row
 * records what each stage did.
 */
export async function runDiscoveryPipeline(
  input: PipelineInput,
  context: Pick<JobContext, "step" | "signal">,
): Promise<RunStats> {
  const profile = await prisma.jobSearchProfile.findUnique({ where: { id: input.profileId } });
  if (!profile) throw new Error("The search profile was deleted before this run could start.");
  const run = await prisma.discoveryRun.create({ data: { profileId: profile.id, status: RunStatus.RUNNING, startedAt: new Date() }, select: { id: true } });

  const stats = { fetched: 0, duplicates: 0, deterministicRejected: 0, screened: 0, shortlisted: 0, assessed: 0, failed: 0, message: "" };
  let status: RunStatus = RunStatus.DONE;
  let error: string | null = null;

  // Ends the run whatever came out. lastRunAt moves on even for a failed
  // run, so a broken source can't be retried in a tight loop.
  const finish = async (endStatus: RunStatus, message: string | null) => {
    status = endStatus;
    error = message;
    if (stats.message === "") stats.message = message ?? statsMessage(stats);
    await prisma.discoveryRun.update({
      where: { id: run.id },
      data: { status, step: null, error, stats: stats as unknown as Prisma.InputJsonValue, finishedAt: new Date() },
    });
    await prisma.jobSearchProfile.update({ where: { id: profile.id }, data: { lastRunAt: new Date() } });
  };

  const step = async (name: string) => {
    await context.step(name);
    await prisma.discoveryRun.update({ where: { id: run.id }, data: { step: name } });
  };

  try {
    const query = readQuery(profile);
    const criteria = criteriaFrom(profile);
    const filterProfile: ProfileWithCriteria = {
      remotePreference: profile.remotePreference,
      salaryMin: profile.salaryMin,
      currency: profile.currency,
      startupOnly: profile.startupOnly,
      companySize: profile.companySize,
      criteria,
    };

    await step("Fetching postings");
    let postings: FoundPosting[];
    try {
      postings = await fetchPostings(profile, query, context);
    } catch (cause) {
      // The source's own message is for the user; anything else isn't, and rethrows to the job.
      if (cause instanceof JobSearchError || cause instanceof DiscoveryProblem) {
        await finish(RunStatus.FAILED, cause.message);
        return stats;
      }
      throw cause;
    }
    stats.fetched = postings.length;
    if (postings.length === 0) {
      await finish(RunStatus.DONE, null);
      return stats;
    }

    // Dedupe first: within this run, and against every posting an earlier run assessed.
    const { fresh, duplicates } = duplicateFinder(postings, await assessedKeys(postings));
    stats.duplicates = duplicates.length;

    // Stages 1 and 2, deterministic and keyword.
    await step("Filtering postings");
    const skip = new Set<DiscoveryStage>(query.skipStages);
    const survivors: SurvivingPosting[] = [];
    for (const posting of fresh) {
      if (context.signal.aborted) break;
      const row = await storeDiscoveredPosting(posting);
      if (!skip.has("DETERMINISTIC")) {
        const outcome = deterministicFilter(posting, filterProfile);
        if (!outcome.passed) {
          stats.deterministicRejected += 1;
          await writeAssessment(row.id, profile.id, {
            stage: "DETERMINISTIC",
            decision: AssessmentDecision.REJECT,
            reasons: [reasonText(outcome.reason)],
            rejectedReason: outcome.reason,
          });
          continue;
        }
      }
      survivors.push({ id: row.id, posting, keywords: skip.has("KEYWORD") ? EMPTY_MATCHES : keywordMatch(posting.description, criteria) });
    }

    // Stages 3 and 4, in order of the keyword hint. The profile's cap
    // counts postings, not calls: one posting screened and then assessed
    // is one of its maxJobsPerRun.
    const screening = !skip.has("SCREENED") && input.screen !== undefined;
    const assessing = !skip.has("ASSESSED") && input.assess !== undefined;
    if (screening || assessing) await step("Screening and assessing postings");
    const ordered = survivors.toSorted((a, b) => b.keywords.scoreHint - a.keywords.scoreHint || a.posting.title.localeCompare(b.posting.title));
    let used = 0;
    // The stage a shortlisted posting's pending row names, when assessment is off.
    const stageSoFar = screening ? "SCREENED" : "KEYWORD";
    for (const entry of ordered) {
      if (context.signal.aborted) break;
      if (!screening && !assessing) {
        const shortlisted = entry.keywords.scoreHint >= KEYWORD_SHORTLIST_SCORE;
        if (shortlisted) stats.shortlisted += 1;
        await writeAssessment(entry.id, profile.id, {
          stage: "KEYWORD",
          decision: AssessmentDecision.PENDING,
          reasons: [
            shortlisted
              ? "Shortlisted by keyword score; deep assessment is off for this profile."
              : `The keyword score didn't reach the shortlist score of ${KEYWORD_SHORTLIST_SCORE}.`,
          ],
        });
        continue;
      }
      if (used >= profile.maxJobsPerRun) {
        await writeAssessment(entry.id, profile.id, {
          stage: "KEYWORD",
          decision: AssessmentDecision.PENDING,
          reasons: [`The profile assesses at most ${profile.maxJobsPerRun} postings per run.`],
        });
        continue;
      }
      used += 1;
      if (screening) {
        stats.screened += 1;
        let verdict;
        try {
          verdict = await input.screen!(entry.posting, { signal: context.signal });
        } catch {
          // One posting that fails doesn't stop the rest.
          stats.failed += 1;
          continue;
        }
        if (verdict.verdict === "SKIP") {
          await writeAssessment(entry.id, profile.id, {
            stage: "SCREENED",
            decision: AssessmentDecision.REJECT,
            reasons: verdict.reasons.length > 0 ? verdict.reasons : ["The screener skipped this posting."],
          });
          continue;
        }
      } else if (entry.keywords.scoreHint < KEYWORD_SHORTLIST_SCORE) {
        await writeAssessment(entry.id, profile.id, {
          stage: "KEYWORD",
          decision: AssessmentDecision.PENDING,
          reasons: [`The keyword score didn't reach the shortlist score of ${KEYWORD_SHORTLIST_SCORE}.`],
        });
        continue;
      }
      stats.shortlisted += 1;
      if (!assessing) {
        await writeAssessment(entry.id, profile.id, {
          stage: stageSoFar,
          decision: AssessmentDecision.PENDING,
          reasons: ["Shortlisted; deep assessment is off for this profile."],
        });
        continue;
      }
      let result;
      try {
        result = await input.assess!(entry.id, { posting: entry.posting, criteria, keywords: entry.keywords, signal: context.signal });
      } catch {
        stats.failed += 1;
        continue;
      }
      stats.assessed += 1;
      await writeAssessment(entry.id, profile.id, {
        stage: "ASSESSED",
        decision: result.decision,
        score: result.score,
        confidence: result.confidence,
        reasons: result.reasons,
        assessedWith: result.assessedWith,
        dimensions: result.dimensions as Prisma.InputJsonValue | undefined,
        requirements: result.requirements as Prisma.InputJsonValue | undefined,
        critique: result.critique as Prisma.InputJsonValue | undefined,
      });
    }

    if (context.signal.aborted) {
      await finish(RunStatus.CANCELLED, "Cancelled.");
      return stats;
    }
    await finish(RunStatus.DONE, null);
    return stats;
  } catch (cause) {
    if (context.signal.aborted) {
      await finish(RunStatus.CANCELLED, "Cancelled.");
      return stats;
    }
    // A problem the user can fix ends the run with its message; anything else isn't, and rethrows to the job.
    if (cause instanceof DiscoveryProblem) {
      await finish(RunStatus.FAILED, cause.message);
      return stats;
    }
    logServerError("discovery run", cause);
    await finish(RunStatus.FAILED, cause instanceof Error ? cause.message.split("\n", 1)[0] : "The run failed unexpectedly.");
    throw cause;
  }
}
