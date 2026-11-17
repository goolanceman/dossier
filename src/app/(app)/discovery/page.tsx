import type { Metadata } from "next";

import type { JobSearchProfile } from "@/generated/prisma/client";
import { JobStatus } from "@/generated/prisma/enums";
import { listExternalSourceSettings } from "@/lib/discovery/external";
import { runStatsSchema } from "@/lib/discovery/pipeline";
import { criteriaFrom, listOf, listProfiles, profileQuerySchema, remotePreferenceSchema } from "@/lib/discovery/profile";
import { formatDateTime } from "@/lib/dates";
import { loadJobSearchConfig } from "@/lib/job-search/config";
import { COUNTRIES, countryName } from "@/lib/job-search/countries";
import { describeSearch, EMPTY_QUERY } from "@/lib/job-search/search";
import { SOURCE_INFO } from "@/lib/job-search/sources";
import { prisma } from "@/lib/prisma";
import { userTimeZone } from "@/lib/time-zone";

import { DiscoveryScreen, type DiscoveryProfileView, type DiscoveryRunView, type RunPostingView } from "./discovery-screen";
import type { ProfileFormValues } from "./profile-editor";
import { profileRunProblem } from "./gates";

export const metadata: Metadata = { title: "Discovery" };

const RUNS_SHOWN = 20;

/** "Daily", "Every 6 hours", or the cron expression as it stands. */
function scheduleOf(profile: JobSearchProfile): string {
  switch (profile.scheduleKind) {
    case "HOURLY":
      return "Hourly";
    case "EVERY_6_HOURS":
      return "Every 6 hours";
    case "DAILY":
      return "Daily";
    case "WEEKDAYS":
      return "Weekdays";
    case "CRON":
      return profile.cron;
  }
}

/** The search in a line, with what answers it: the source, or the external one. */
function searchOf(profile: JobSearchProfile, sourceLabels: ReadonlyMap<string, string>): string {
  const query = profileQuerySchema.safeParse(profile.query);
  if (!query.success) return "The saved search can't be read. Open the profile and save it again.";
  const base = describeSearch(query.data, countryName(query.data.country) || query.data.country.toUpperCase(), query.data.externalSourceId ? null : profile.source);
  const source = query.data.externalSourceId ? sourceLabels.get(query.data.externalSourceId) : SOURCE_INFO[profile.source].name;
  return [base, source ? `via ${source}` : ""].filter(Boolean).join(" · ");
}

/** The run's counts as the stats schema spells them, or null when they're missing or old. */
function statsOf(stats: unknown) {
  const parsed = runStatsSchema.safeParse(stats);
  return parsed.success ? parsed.data : null;
}

/** "12,345 in · 4,567 out", when a run's stats say what the AI calls used; null when not. */
function tokensOf(stats: unknown): string | null {
  if (typeof stats !== "object" || stats === null) return null;
  const { inputTokens, outputTokens } = stats as Record<string, unknown>;
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") return null;
  return `${inputTokens.toLocaleString("en-GB")} in · ${outputTokens.toLocaleString("en-GB")} out`;
}

/** The postings one run touched: the assessment rows its window rewrote (master.md Phase 18). */
function postingsOf(run: { profileId: string; createdAt: Date; startedAt: Date | null; finishedAt: Date | null }, assessments: Awaited<ReturnType<typeof loadAssessments>>, now: Date): RunPostingView[] {
  const start = run.startedAt ?? run.createdAt;
  const end = run.finishedAt ?? now;
  return assessments
    .filter((row) => row.profileId === run.profileId && row.updatedAt >= start && row.updatedAt <= end)
    .map((row) => ({
      id: row.id,
      title: row.posting.title.trim() || "Untitled posting",
      company: row.posting.company.trim(),
      url: row.posting.url,
      stage: row.stage,
      decision: row.decision,
      score: row.score,
      confidence: row.confidence,
      reasons: listOf(row.reasons),
      rejectedReason: row.rejectedReason,
    }));
}

/** The profile as the editor starts from it: every field, read leniently. */
function draftOf(profile: JobSearchProfile): ProfileFormValues {
  const query = profileQuerySchema.safeParse(profile.query);
  const remote = remotePreferenceSchema.safeParse(profile.remotePreference);
  return {
    name: profile.name,
    enabled: profile.enabled,
    source: profile.source,
    query: query.success ? query.data : { ...EMPTY_QUERY, skipStages: [] },
    criteria: criteriaFrom(profile),
    remotePreference: remote.success ? remote.data : "REMOTE_OR_HYBRID",
    salaryMin: profile.salaryMin,
    salaryMax: profile.salaryMax,
    currency: profile.currency,
    companySize: profile.companySize,
    startupOnly: profile.startupOnly,
    timeZone: profile.timeZone,
    scheduleKind: profile.scheduleKind,
    cron: profile.cron,
    maxJobsPerRun: profile.maxJobsPerRun,
  };
}

async function loadAssessments(profileIds: readonly string[], since: Date) {
  if (profileIds.length === 0) return [];
  return prisma.jobAssessment.findMany({
    where: { profileId: { in: [...profileIds] }, updatedAt: { gte: since } },
    include: { posting: { select: { id: true, title: true, company: true, url: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Discovery (master.md Phase 2): the search profiles and their schedules,
 * the runs on record with what each stage did, and the external sources a
 * profile can search instead of the built-ins.
 */
export default async function DiscoveryPage() {
  const [profiles, config, timeZone, sources] = await Promise.all([listProfiles(), loadJobSearchConfig(), userTimeZone(), listExternalSourceSettings()]);
  const now = new Date();

  const [runs, runJobs] = await Promise.all([
    prisma.discoveryRun.findMany({ orderBy: { createdAt: "desc" }, take: RUNS_SHOWN, include: { profile: { select: { name: true } } } }),
    prisma.job.findMany({
      where: { type: "discovery-run", status: { in: [JobStatus.QUEUED, JobStatus.RUNNING] } },
      select: { id: true, key: true },
    }),
  ]);

  const sourceLabels = new Map(sources.map((source) => [source.id, source.label] as const));
  // A run per profile that's queued or running, keyed "discovery:<id>", to follow.
  const runJobByProfile = new Map(runJobs.map((job) => [job.key?.replace(/^discovery:/, "") ?? "", job.id]));
  const lastRunByProfile = new Map<string, (typeof runs)[number]>();
  for (const run of runs) if (!lastRunByProfile.has(run.profileId)) lastRunByProfile.set(run.profileId, run);

  const profileViews: DiscoveryProfileView[] = [];
  for (const profile of profiles) {
    const lastRun = lastRunByProfile.get(profile.id);
    const stats = lastRun ? statsOf(lastRun.stats) : null;
    profileViews.push({
      id: profile.id,
      name: profile.name,
      enabled: profile.enabled,
      sourceName: SOURCE_INFO[profile.source].name,
      search: searchOf(profile, sourceLabels),
      schedule: scheduleOf(profile),
      lastRunAt: profile.lastRunAt ? formatDateTime(profile.lastRunAt, timeZone, now) : null,
      lastStats: stats?.message ?? null,
      runProblem: await profileRunProblem(profile, config, sources),
      runJobId: runJobByProfile.get(profile.id) ?? null,
      draft: draftOf(profile),
    });
  }

  const assessments = await loadAssessments([...new Set(runs.map((run) => run.profileId))], runs.at(-1)?.startedAt ?? runs.at(-1)?.createdAt ?? now);
  const runViews: DiscoveryRunView[] = runs.map((run) => {
    const stats = statsOf(run.stats);
    return {
      id: run.id,
      profileName: run.profile.name,
      status: run.status,
      step: run.step,
      startedAt: run.startedAt ? formatDateTime(run.startedAt, timeZone, now) : null,
      finishedAt: run.finishedAt ? formatDateTime(run.finishedAt, timeZone, now) : null,
      error: run.error,
      stats,
      tokens: tokensOf(run.stats),
      postings: postingsOf(run, assessments, now),
    };
  });

  return <DiscoveryScreen profiles={profileViews} runs={runViews} sources={sources} countries={COUNTRIES} />;
}
