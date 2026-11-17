import "server-only";

import { z } from "zod";

import { AssessmentDecision, DocumentKind, GapQuestionStatus, SalaryStatus } from "@/generated/prisma/enums";
import { hasResumeContent, planItemsSchema } from "@/lib/career/plan";
import { prisma } from "@/lib/prisma";
import { loadProfile } from "@/lib/profile-data";

// The daily digest (master.md Phase 15): what discovery did in the last 24
// hours, the best matches it found, new salary figures, and what's waiting
// for the user. Every number is read from the database; nothing is estimated,
// and a quiet day says so instead of staying empty.

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_MATCHES = 5;
const SALARY_LINES = 5;
/** Match reasons per digest entry; the full list stays in the posting's assessment. */
const TOP_REASONS = 3;

/** The stats a DiscoveryRun keeps (runStatsSchema in src/lib/discovery/pipeline.ts), read loose: the digest only sums the counts. */
const runStats = z
  .object({
    fetched: z.number(),
    duplicates: z.number(),
    deterministicRejected: z.number(),
    screened: z.number(),
    shortlisted: z.number(),
    assessed: z.number(),
  })
  .partial()
  .catch({});

/** One number per pipeline stage, summed over the day's runs. */
const countsSchema = z.object({
  discovered: z.number().int().min(0),
  rejectedDeterministic: z.number().int().min(0),
  screened: z.number().int().min(0),
  shortlisted: z.number().int().min(0),
  assessed: z.number().int().min(0),
});

/** One of the day's best assessments, with its posting. */
const bestMatchSchema = z.object({
  postingId: z.string(),
  title: z.string(),
  company: z.string(),
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
  url: z.string(),
});

/** A new salary figure, as one line. */
const salaryInsightSchema = z.object({ company: z.string(), title: z.string(), label: z.string() });

export const digestSchema = z.object({
  counts: countsSchema,
  bestMatches: z.array(bestMatchSchema),
  salaryInsights: z.array(salaryInsightSchema),
  gapQuestionsOpen: z.number().int().min(0),
  nextActions: z.array(z.string()),
});
export type Digest = z.output<typeof digestSchema>;

const BASIS_LABEL: Record<string, string> = { ANNUAL: "a year", MONTHLY: "a month", HOURLY: "an hour" };

/** A figure in words, or null when the row has none to show: one is never invented (master.md §4). */
function salaryLabel(row: { minimum: number | null; maximum: number | null; median: number | null; currency: string; basis: string }): string | null {
  const basis = BASIS_LABEL[row.basis] ?? "a year";
  const money = (amount: number) => `${row.currency} ${amount.toLocaleString("en-GB")}`.trim();
  if (row.median !== null) return `${money(row.median)} median ${basis}`;
  if (row.minimum !== null && row.maximum !== null) return `${money(row.minimum)} to ${money(row.maximum)} ${basis}`;
  if (row.minimum !== null) return `from ${money(row.minimum)} ${basis}`;
  if (row.maximum !== null) return `up to ${money(row.maximum)} ${basis}`;
  return null;
}

/** A saved reason list (stringList), or an empty one when it doesn't parse. */
function reasonsOf(value: unknown): string[] {
  const parsed = z.array(z.string()).safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** The goals of a plan's items column, read leniently: junk in the column reads as none (the plan lib's own schema). */
function planGoals(items: unknown) {
  return planItemsSchema.parse((items as { goals?: unknown } | null)?.goals);
}

/** The honest next steps: only the ones with something behind them. */
async function nextActions(
  counts: z.output<typeof countsSchema>,
  bestMatches: number,
  gapQuestionsOpen: number,
  pausedProfiles: number,
  extras: { resumeMissing: boolean; undonePlanActions: number },
): Promise<string[]> {
  const actions: string[] = [];
  const review = counts.shortlisted > 0 ? counts.shortlisted : bestMatches;
  if (review > 0) actions.push(`Review ${review} shortlisted ${review === 1 ? "job" : "jobs"}`);
  if (gapQuestionsOpen > 0) actions.push(`Answer ${gapQuestionsOpen} open gap ${gapQuestionsOpen === 1 ? "question" : "questions"}`);
  if (pausedProfiles > 0) actions.push(`Run discovery for ${pausedProfiles} paused ${pausedProfiles === 1 ? "profile" : "profiles"}`);
  // The master resume (master.md §5.5): point at Resume intelligence while the profile can build one and none exists.
  if (extras.resumeMissing) actions.push("Build your master resume from a critique in Resume intelligence");
  if (extras.undonePlanActions > 0)
    actions.push(`${extras.undonePlanActions} career-plan ${extras.undonePlanActions === 1 ? "action" : "actions"} to check off in Career`);
  return actions;
}

/** Builds the digest for the 24 hours before `now`, from the database alone. */
export async function buildDigest(now = new Date()): Promise<Digest> {
  const since = new Date(now.getTime() - DAY_MS);
  const [runs, assessments, gapQuestionsOpen, salaries, pausedProfiles, profile, masterResume, plans] = await Promise.all([
    prisma.discoveryRun.findMany({ where: { createdAt: { gte: since } }, select: { stats: true } }),
    prisma.jobAssessment.findMany({
      where: {
        decision: { in: [AssessmentDecision.STRONG_MATCH, AssessmentDecision.POTENTIAL_MATCH] },
        score: { not: null },
        updatedAt: { gte: since },
      },
      orderBy: { score: "desc" },
      take: 20,
      select: { postingId: true, score: true, decision: true, reasons: true, posting: { select: { title: true, company: true, url: true } } },
    }),
    prisma.gapQuestion.count({ where: { status: GapQuestionStatus.OPEN } }),
    prisma.salaryEstimate.findMany({
      where: { createdAt: { gte: since }, status: { not: SalaryStatus.UNAVAILABLE } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { company: true, title: true, minimum: true, maximum: true, median: true, currency: true, basis: true },
    }),
    prisma.jobSearchProfile.count({ where: { enabled: false } }),
    loadProfile(),
    prisma.document.findFirst({ where: { applicationId: null, kind: DocumentKind.RESUME }, select: { id: true } }),
    prisma.careerPlan.findMany({ select: { items: true } }),
  ]);

  const counts = runs.reduce(
    (sums, run) => {
      const stats = runStats.parse(run.stats);
      return {
        discovered: sums.discovered + Math.max(0, (stats.fetched ?? 0) - (stats.duplicates ?? 0)),
        rejectedDeterministic: sums.rejectedDeterministic + (stats.deterministicRejected ?? 0),
        screened: sums.screened + (stats.screened ?? 0),
        shortlisted: sums.shortlisted + (stats.shortlisted ?? 0),
        assessed: sums.assessed + (stats.assessed ?? 0),
      };
    },
    { discovered: 0, rejectedDeterministic: 0, screened: 0, shortlisted: 0, assessed: 0 },
  );

  // Strong matches before potential ones, the better score first within each.
  const bestMatches = assessments
    .map((row) => ({
      postingId: row.postingId,
      title: row.posting.title,
      company: row.posting.company,
      score: row.score ?? 0,
      reasons: reasonsOf(row.reasons),
      url: row.posting.url,
      strong: row.decision === AssessmentDecision.STRONG_MATCH,
    }))
    .sort((a, b) => Number(b.strong) - Number(a.strong) || b.score - a.score)
    .slice(0, TOP_MATCHES);

  const salaryInsights = salaries
    .map((row) => ({ company: row.company, title: row.title, label: salaryLabel(row) }))
    .filter((insight): insight is { company: string; title: string; label: string } => insight.label !== null)
    .slice(0, SALARY_LINES);

  return digestSchema.parse({
    counts,
    bestMatches,
    salaryInsights,
    gapQuestionsOpen,
    nextActions: await nextActions(counts, bestMatches.length, gapQuestionsOpen, pausedProfiles, {
      resumeMissing: masterResume === null && hasResumeContent(profile),
      undonePlanActions: plans.reduce((sum, plan) => sum + planGoals(plan.items).flatMap((goal) => goal.actions).filter((action) => !action.done).length, 0),
    }),
  });
}

/** The digest as Markdown, for the export (master.md Phase 15). Every section says what it found, or that it found nothing. */
export function digestMarkdown(digest: Digest): string {
  const { counts, bestMatches, salaryInsights, gapQuestionsOpen, nextActions } = digest;
  const lines: string[] = ["# Daily job digest", "", "## The last 24 hours", ""];
  if (counts.discovered === 0 && counts.screened === 0 && counts.assessed === 0) {
    lines.push("Nothing ran in the last 24 hours.");
  } else {
    lines.push(`- ${counts.discovered} new ${counts.discovered === 1 ? "posting" : "postings"} found`);
    if (counts.rejectedDeterministic > 0) lines.push(`- ${counts.rejectedDeterministic} rejected by the fixed filters`);
    if (counts.screened > 0) lines.push(`- ${counts.screened} screened`);
    if (counts.shortlisted > 0) lines.push(`- ${counts.shortlisted} shortlisted`);
    if (counts.assessed > 0) lines.push(`- ${counts.assessed} fully assessed`);
  }

  lines.push("", "## Best matches", "");
  if (bestMatches.length === 0) {
    lines.push("No strong matches yet.");
  } else {
    for (const [index, match] of bestMatches.entries()) {
      lines.push(`${index + 1}. ${match.title || "Untitled posting"} at ${match.company || "an unknown company"}: score ${match.score} of 100`);
      for (const reason of match.reasons.slice(0, TOP_REASONS)) lines.push(`   - ${reason}`);
      if (match.url !== "") lines.push(`   - ${match.url}`);
    }
  }

  lines.push("", "## Salary figures", "");
  if (salaryInsights.length === 0) {
    lines.push("No new salary figures.");
  } else {
    for (const insight of salaryInsights) lines.push(`- ${insight.company || "Unknown company"}, ${insight.title || "unknown role"}: ${insight.label}`);
  }

  lines.push("", "## Gap questions", "");
  lines.push(
    gapQuestionsOpen === 0
      ? "No gap questions are waiting."
      : `${gapQuestionsOpen} open gap ${gapQuestionsOpen === 1 ? "question" : "questions"} ${gapQuestionsOpen === 1 ? "is" : "are"} waiting for an answer.`,
  );

  lines.push("", "## Next steps", "");
  if (nextActions.length === 0) {
    lines.push("Nothing is waiting: discovery is idle, and no questions are open.");
  } else {
    for (const action of nextActions) lines.push(`- ${action}`);
  }
  return `${lines.join("\n")}\n`;
}
