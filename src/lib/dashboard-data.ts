import "server-only";

import type { SalaryEstimate } from "@/generated/prisma/client";
import { AssessmentDecision, GapQuestionStatus, LearningStatus, MockStatus } from "@/generated/prisma/enums";
import { careerNextActions, dashboardFigures, type CareerIntel, type DashboardFigures, type DashboardOptions } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { estimateLabel } from "@/lib/salary/estimate";

// The career intelligence section (master.md Phase 14), read in parallel
// from what discovery, the pipeline, interview, learning and the AI layer
// keep. The window for "new" and "recent" is 7 days, the loader's own.
const SEVEN_DAYS = 7 * 86_400_000;

/** The stages a posting passes before its full assessment; "stage < ASSESSED". */
const PRE_ASSESSMENT_STAGES = ["DETERMINISTIC", "KEYWORD", "SCREENED"];

const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString("en-GB")}`;

/** The range in words, or null when there is no figure to show; the same wording the intelligence page uses. */
function salaryRange(estimate: Pick<SalaryEstimate, "status" | "minimum" | "maximum" | "currency">): string | null {
  if (estimate.status === "UNAVAILABLE") return null;
  const { minimum, maximum, currency } = estimate;
  if (minimum !== null && maximum !== null) return minimum === maximum ? money(minimum, currency) : `${money(minimum, currency)} – ${money(maximum, currency)}`;
  return [minimum !== null ? `from ${money(minimum, currency)}` : null, maximum !== null ? `up to ${money(maximum, currency)}` : null].filter(Boolean).join(" ") || null;
}

/** A run's fetched count, read leniently the way the discovery screen reads its stats; 0 when missing or old. */
function fetchedOf(stats: unknown): number {
  if (typeof stats !== "object" || stats === null) return 0;
  const fetched = (stats as Record<string, unknown>).fetched;
  return typeof fetched === "number" && Number.isInteger(fetched) && fetched >= 0 ? fetched : 0;
}

/**
 * The career intelligence section's figures (master.md Phase 14), all from
 * real rows, or null when there is nothing at all to show. Jobs discovered
 * and AI use cover the last 7 days; the rest is about now.
 */
export async function loadCareerIntel(now = new Date()): Promise<CareerIntel | null> {
  const since = new Date(now.getTime() - SEVEN_DAYS);
  const [profiles, runs, matches, reviewJobs, openQuestions, questionsByPrepared, topicsByStatus, mocks, salaries, usageTotals, failures] = await Promise.all([
    prisma.jobSearchProfile.count({ where: { enabled: true } }),
    prisma.discoveryRun.findMany({ where: { createdAt: { gte: since } }, select: { stats: true } }),
    prisma.jobAssessment.findMany({
      where: { decision: { in: [AssessmentDecision.STRONG_MATCH, AssessmentDecision.POTENTIAL_MATCH] }, score: { gte: 0 } },
      orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
      take: 3,
      select: { postingId: true, score: true, decision: true, posting: { select: { title: true, company: true } } },
    }),
    // Worth a human look but without one: undecided, or the pipeline not done with it, and scored well enough.
    prisma.jobAssessment.count({
      where: { score: { gte: 60 }, OR: [{ decision: AssessmentDecision.PENDING }, { stage: { in: PRE_ASSESSMENT_STAGES } }] },
    }),
    prisma.gapQuestion.count({ where: { status: GapQuestionStatus.OPEN } }),
    prisma.interviewQuestion.groupBy({ by: ["prepared"], _count: { _all: true } }),
    prisma.learningTopic.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.mockSession.aggregate({ where: { status: MockStatus.COMPLETED }, _count: { _all: true }, _avg: { score: true } }),
    prisma.salaryEstimate.findMany({ orderBy: { updatedAt: "desc" }, take: 3 }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, estimatedCost: true } }),
    prisma.aiUsage.count({ where: { createdAt: { gte: since }, success: false } }),
  ]);

  const newJobs = profiles > 0 ? runs.reduce((sum, run) => sum + fetchedOf(run.stats), 0) : null;
  const bestMatches = matches.map((match) => ({
    postingId: match.postingId,
    title: match.posting.title.trim() || "Untitled posting",
    company: match.posting.company.trim(),
    score: match.score ?? 0,
    decision: match.decision,
  }));
  const review = { jobs: reviewJobs, questions: openQuestions };
  const totalQuestions = questionsByPrepared.reduce((sum, row) => sum + row._count._all, 0);
  const preparedQuestions = questionsByPrepared.find((row) => row.prepared)?._count._all ?? 0;
  const totalTopics = topicsByStatus.reduce((sum, row) => sum + row._count._all, 0);
  const completedTopics = topicsByStatus.find((row) => row.status === LearningStatus.COMPLETED)?._count._all ?? 0;
  const mockSessions = mocks._count._all;
  const progress =
    totalQuestions > 0 || totalTopics > 0 || mockSessions > 0
      ? { preparedQuestions, totalQuestions, completedTopics, totalTopics, mockSessions, mockMeanScore: mocks._avg.score === null ? null : Math.round(mocks._avg.score) }
      : null;
  const usage = { calls: usageTotals._count._all, failures, inputTokens: usageTotals._sum.inputTokens, outputTokens: usageTotals._sum.outputTokens, estimatedCost: usageTotals._sum.estimatedCost };

  if (profiles === 0 && bestMatches.length === 0 && review.jobs === 0 && review.questions === 0 && progress === null && salaries.length === 0 && usage.calls === 0) return null;
  return {
    newJobs,
    bestMatches,
    review,
    progress,
    salaries: salaries.map((salary) => ({ id: salary.id, title: salary.title.trim(), company: salary.company.trim(), range: salaryRange(salary), statusLabel: estimateLabel(salary.status), postingId: salary.postingId })),
    usage,
    actions: careerNextActions({ profiles: profiles > 0, runsLast7Days: runs.length, reviewJobs, openQuestions, unpreparedQuestions: totalQuestions - preparedQuestions }),
  };
}

/**
 * Every dashboard figure, from all applications, archived ones included
 * (E9-6), for a period (E9-8), with the follow-up threshold and time zone
 * for "Worth a look" (E9-9).
 */
export async function loadDashboard(options: DashboardOptions = {}, now = new Date()): Promise<DashboardFigures> {
  // Agent drafts count once they're approved (#195).
  const applications = await prisma.application.findMany({
    where: { awaitingReview: false },
    select: {
      id: true,
      title: true,
      company: true,
      role: true,
      status: true,
      furthestStage: true,
      archivedAt: true,
      deadline: true,
      sentAt: true,
      nextInterviewAt: true,
      createdAt: true,
      updatedAt: true,
      events: { select: { at: true }, orderBy: { at: "desc" }, take: 1 },
    },
  });
  return dashboardFigures(
    applications.map((application) => ({
      id: application.id,
      company: application.company.trim(),
      role: application.role.trim() || application.title.trim() || "Untitled application",
      status: application.status,
      furthestStage: application.furthestStage,
      archived: application.archivedAt !== null,
      deadline: application.deadline,
      lastStatusChange: application.events[0]?.at ?? null,
      sentAt: application.sentAt,
      nextInterviewAt: application.nextInterviewAt,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    })),
    now,
    options,
  );
}
