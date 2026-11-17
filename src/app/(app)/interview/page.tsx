import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { isAiConfigured } from "@/lib/ai/config";
import { listAchievements } from "@/lib/career/achievements";
import { listTargets } from "@/lib/career/targets";
import { GapQuestionStatus } from "@/generated/prisma/enums";
import { listGapQuestions } from "@/lib/gaps/lifecycle";
import { getSession, listSessions } from "@/lib/interview/mock";
import { getPlan as getInterviewPlan, listPlans, listStarStories } from "@/lib/interview/plans";
import { getPlan as getLearningPlan, listPlans as listLearningPlans, planProgress } from "@/lib/learning/plan";
import { stringsOf } from "@/lib/agent/candidates";
import { prisma } from "@/lib/prisma";

import { InterviewScreen, type PlanDetailView, type PlanListItem, type PlanQuestionView } from "./interview-screen";

export const metadata: Metadata = { title: "Interview prep" };

// The interview hub (master.md Phases 7, 8, 14). The page only reads what
// the services and jobs keep: plans, sessions, stories, readiness inputs,
// learning plans, and the pickers (targets and saved postings, read from
// Prisma directly because no service lists them for a picker).

/** The rounds JSON column read back as data. */
const roundsSchema = z.array(z.object({ name: z.string(), focus: z.string() })).catch([]);

/** First value when a query param arrives as one string or a list. */
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** A question row as the screen shows it: its JSON lists resolved. */
function toQuestionView(row: {
  id: string;
  category: string;
  difficulty: string;
  question: string;
  whyAsked: string;
  expectedTopics: Prisma.JsonValue;
  answerStructure: Prisma.JsonValue;
  evidenceIds: Prisma.JsonValue;
  followUps: Prisma.JsonValue;
  commonMistakes: Prisma.JsonValue;
  resources: Prisma.JsonValue;
  prepared: boolean;
}): PlanQuestionView {
  return {
    id: row.id,
    category: row.category,
    difficulty: row.difficulty,
    question: row.question,
    whyAsked: row.whyAsked,
    expectedTopics: stringsOf(row.expectedTopics),
    answerStructure: stringsOf(row.answerStructure),
    evidenceIds: stringsOf(row.evidenceIds),
    followUps: stringsOf(row.followUps),
    commonMistakes: stringsOf(row.commonMistakes),
    resources: stringsOf(row.resources),
    prepared: row.prepared,
  };
}

export default async function InterviewPage({ searchParams }: PageProps<"/interview">) {
  const params = await searchParams;
  const planId = first(params.plan);
  const learningId = first(params.learning);
  const mockId = first(params.mock);

  const [plans, stories, sessions, openGaps, achievements, targets, aiReady, readinessQuestions, preparedByPlan, savedPostings, learningPlanRows] =
    await Promise.all([
      listPlans(),
      listStarStories(),
      listSessions(),
      listGapQuestions({ status: GapQuestionStatus.OPEN }),
      listAchievements(),
      listTargets(),
      isAiConfigured(),
      // Readiness counts over every question there is (master.md §7.6).
      prisma.interviewQuestion.findMany({ select: { category: true, difficulty: true, prepared: true } }),
      prisma.interviewQuestion.groupBy({ by: ["planId"], where: { prepared: true }, _count: true }),
      // The posting picker: saved postings, newest first; the JD comes from it.
      prisma.posting.findMany({
        where: { savedAt: { not: null } },
        orderBy: { savedAt: "desc" },
        take: 50,
        select: { id: true, title: true, company: true, place: true },
      }),
      listLearningPlans(),
    ]);

  // The drill-downs: one plan, one learning plan, one open session. An id
  // that no longer resolves shows the hub as if nothing was picked.
  const [planRow, learningRow, session] = await Promise.all([
    planId ? getInterviewPlan(planId) : null,
    learningId ? getLearningPlan(learningId) : null,
    mockId ? getSession(mockId) : null,
  ]);
  const learningProgress = await Promise.all(learningPlanRows.map(async (row) => ({ ...row, progress: await planProgress(row.id) })));
  const learningProgressFor = (id: string) => learningProgress.find((row) => row.id === id)?.progress;

  // The open session asks its own plan's questions, or every plan's when it
  // has no plan; with no session open, nothing is needed.
  const sessionPlan = session?.planId ? await getInterviewPlan(session.planId) : null;
  const bankRows =
    session === null ? [] : sessionPlan !== null ? sessionPlan.questions : await prisma.interviewQuestion.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

  const preparedCounts = new Map(preparedByPlan.map((row) => [row.planId, row._count]));
  const planList: PlanListItem[] = plans.map((plan) => ({
    id: plan.id,
    role: plan.role,
    rounds: roundsSchema.parse(plan.rounds),
    questionCount: plan.questionCount,
    preparedCount: preparedCounts.get(plan.id) ?? 0,
    createdAt: plan.createdAt,
  }));

  const plan: PlanDetailView | null =
    planRow === null
      ? null
      : {
          id: planRow.id,
          role: planRow.role,
          rounds: roundsSchema.parse(planRow.rounds),
          preparedWith: planRow.preparedWith,
          createdAt: planRow.createdAt,
          questions: planRow.questions.map(toQuestionView),
        };

  const evidence = Object.fromEntries(achievements.filter(({ title }) => title.trim() !== "").map(({ id, title }) => [id, title]));

  const learningPlans = learningProgress.map((row) => ({
    id: row.id,
    goal: row.goal,
    topicCount: row.topicCount,
    createdAt: row.createdAt,
    progress: { completed: row.progress.COMPLETED, total: row.progress.total },
  }));

  const learningPlan =
    learningRow === null
      ? null
      : {
          id: learningRow.id,
          goal: learningRow.goal,
          plannedWith: learningRow.plannedWith,
          createdAt: learningRow.createdAt,
          topics: learningRow.topics.map((topic) => ({
            id: topic.id,
            title: topic.title,
            sequence: topic.sequence,
            status: topic.status,
            effortHours: topic.effortHours,
            prerequisites: stringsOf(topic.prerequisites),
            exercises: stringsOf(topic.exercises),
            miniProjects: stringsOf(topic.miniProjects),
            interviewQuestions: stringsOf(topic.interviewQuestions),
            resources: stringsOf(topic.resources),
          })),
          progress: { completed: learningProgressFor(learningRow.id)?.COMPLETED ?? 0, total: learningProgressFor(learningRow.id)?.total ?? 0 },
        };

  return (
    <InterviewScreen
      aiReady={aiReady}
      readiness={{
        questions: readinessQuestions,
        sessions: sessions.map(({ kind, status, score }) => ({ kind, status, score })),
        storyCount: stories.length,
        unansweredGaps: openGaps.length,
      }}
      plans={planList}
      plan={plan}
      sessions={sessions}
      session={session}
      sessionQuestions={bankRows.map(toQuestionView)}
      stories={stories}
      achievements={achievements.map(({ id, title }) => ({ id, title }))}
      evidence={evidence}
      postings={savedPostings.map(({ id, title, company }) => ({ id, title, company }))}
      targets={targets.map(({ id, title }) => ({ id, title }))}
      learningPlans={learningPlans}
      learningPlan={learningPlan}
    />
  );
}
