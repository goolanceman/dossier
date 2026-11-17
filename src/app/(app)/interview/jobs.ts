import "server-only";

import { z } from "zod";

import type { RequirementMatch } from "@/lib/ai/task-contracts";
import { requirementMatchSchema } from "@/lib/ai/task-contracts";
import { getProviderForTask } from "@/lib/ai/routing";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { interviewPrep, learningPlan, mockFeedback } from "@/lib/ai/tasks";
import { stringsOf } from "@/lib/agent/candidates";
import { listAchievements } from "@/lib/career/achievements";
import { readTargetPrefs } from "@/lib/career/targets";
import { defineJob } from "@/lib/jobs/runner";
import { addTurn, getSession, recordFeedback } from "@/lib/interview/mock";
import { createPlan as createInterviewPlan, getPlan as getInterviewPlan } from "@/lib/interview/plans";
import { createPlan as createLearningPlan } from "@/lib/learning/plan";
import { prisma } from "@/lib/prisma";
import { loadProfile } from "@/lib/profile-data";

// The interview hub's background work (master.md Phases 7–8, 14): generating
// interview plans, grading mock answers and planning what to learn. Everything
// persists through the interview and learning services; the screens only read
// what these jobs keep.

/** The five rounds every plan covers by default (master.md §7.2). */
export const INTERVIEW_ROUNDS = [
  { name: "Recruiter", focus: "Screening and motivation" },
  { name: "Technical", focus: "Core engineering skills" },
  { name: "System design", focus: "Architecture and trade-offs" },
  { name: "Hiring manager", focus: "Fit, collaboration and delivery" },
  { name: "Culture and leadership", focus: "Values and growth" },
] as const;

/** The requirement statuses an assessment has when the profile can't back it. */
const GAP_STATUSES: RequirementMatch["status"][] = ["CONFIRMED_GAP", "MISSING_EVIDENCE", "TRANSFERABLE"];

/** The posting to work on, or a clear error in the job's log when it's gone. */
async function loadPosting(postingId: string) {
  const posting = await prisma.posting.findUnique({ where: { id: postingId } });
  if (!posting) throw new Error("The posting is no longer there.");
  return posting;
}

/** What the evidence prompts need from an achievement: its id, title and description. */
function forPrompts(achievements: Awaited<ReturnType<typeof listAchievements>>) {
  return achievements.map(({ id, title, description }) => ({ id, title, summary: description }));
}

/**
 * An interview plan (master.md §7.1–7.3): predicted, representative questions
 * for the role, from the posting's JD when there is one, else from a career
 * target. The task frames the JD text as untrusted material itself
 * (UNTRUSTED_POSTING and postingForPrompt), so it is passed as written.
 */
export const generateInterviewPlanJob = defineJob({
  type: "generate-interview-plan",
  input: z.object({
    role: z.string().min(1).max(200),
    postingId: z.string().min(1).max(100).optional(),
    targetId: z.string().min(1).max(100).optional(),
  }),
  result: z.object({ planId: z.string() }),
  async run({ role, postingId, targetId }, { step, signal }) {
    await step("Loading the context");
    const posting = postingId ? await loadPosting(postingId) : null;
    const target = targetId ? await prisma.careerTarget.findUnique({ where: { id: targetId } }) : null;
    if (targetId && !target) throw new Error("The career target is no longer there.");
    const [profile, achievements] = await Promise.all([loadProfile(), listAchievements()]);

    await step("Preparing interview questions");
    const jd =
      posting?.description ||
      (target ? ["Target role: " + target.title, target.summary.trim() === "" ? "" : `Aim: ${target.summary}`].filter(Boolean).join("\n") : "");
    const [provider, options] = await Promise.all([getProviderForTask("interview-prep"), loadTaskOptions()]);
    const { data, promptVersion } = await interviewPrep(
      provider,
      {
        title: posting?.title || target?.title || role,
        company: posting?.company ?? "",
        posting: jd,
        profile,
        achievements: forPrompts(achievements),
        stage: "",
      },
      { ...options, signal },
    );

    await step("Saving the plan");
    const { planId } = await createInterviewPlan({
      ...(posting ? { postingId: posting.id } : {}),
      role: role.trim(),
      rounds: INTERVIEW_ROUNDS.map((round) => ({ ...round })),
      generated: data,
      preparedWith: promptVersion,
    });
    return { planId };
  },
});

/**
 * The interviewer's verdict on one mock answer (master.md §7.5), per turn:
 * the turn is kept before grading, so a failed AI call loses nothing the
 * candidate said, and the verdict lands on the session through
 * recordFeedback, which also scores and completes it.
 */
export const mockFeedbackJob = defineJob({
  type: "mock-feedback",
  input: z.object({
    sessionId: z.string().min(1).max(100),
    question: z.string().min(1).max(2_000),
    answer: z.string().min(1).max(10_000),
  }),
  result: z.object({ sessionId: z.string(), score: z.number() }),
  async run({ sessionId, question, answer }, { step, signal }) {
    await step("Saving your answer");
    const session = await getSession(sessionId);
    if (!session) throw new Error("The mock session is no longer there.");
    await addTurn(sessionId, { question, answer });

    await step("Getting the interviewer's verdict");
    // The points a strong answer would make come from the plan's own question,
    // so the feedback grades against what the candidate was told to cover.
    const plan = session.planId ? await getInterviewPlan(session.planId) : null;
    const asked = plan?.questions.find((row) => row.question === question);
    const answerPoints = asked ? [...stringsOf(asked.expectedTopics), ...stringsOf(asked.answerStructure)].join("; ") : "";
    const [provider, options] = await Promise.all([getProviderForTask("mock-feedback"), loadTaskOptions()]);
    const { data } = await mockFeedback(provider, { question, answer, answerPoints }, { ...options, signal });

    await step("Recording the verdict");
    const finished = await recordFeedback(sessionId, data, { signal });
    return { sessionId, score: finished.score ?? 0 };
  },
});

/**
 * A learning plan (master.md Phase 8) for a goal: the gaps come from the
 * posting's assessment when there is one, else from the target's keywords,
 * else the model works from the goal alone and the profile's known skills.
 */
export const generateLearningPlanJob = defineJob({
  type: "generate-learning-plan",
  input: z.object({
    goal: z.string().min(1).max(1_000),
    postingId: z.string().min(1).max(100).optional(),
    targetId: z.string().min(1).max(100).optional(),
  }),
  result: z.object({ planId: z.string() }),
  async run({ goal, postingId, targetId }, { step, signal }) {
    await step("Loading the gaps");
    const posting = postingId ? await loadPosting(postingId) : null;
    const target = targetId ? await prisma.careerTarget.findUnique({ where: { id: targetId } }) : null;
    if (targetId && !target) throw new Error("The career target is no longer there.");
    const profile = await loadProfile();

    let gaps: string[] = [];
    if (posting) {
      const row = await prisma.jobAssessment.findUnique({ where: { postingId: posting.id } });
      gaps = z
        .array(requirementMatchSchema)
        .catch([])
        .parse(row?.requirements)
        .filter((requirement) => GAP_STATUSES.includes(requirement.status))
        .map((requirement) => requirement.requirement);
    } else if (target) {
      gaps = readTargetPrefs(target.preferences).keywords;
    }
    const withGaps = gaps.length > 0 ? `${goal.trim()} (close these gaps: ${gaps.join(", ")})`.slice(0, 1_000) : goal.trim();

    await step("Planning what to learn");
    const [provider, options] = await Promise.all([getProviderForTask("learning-plan"), loadTaskOptions()]);
    const { data, promptVersion } = await learningPlan(
      provider,
      { goal: withGaps, known: profile.skills.map((skill) => skill.name), weeklyHours: 0 },
      { ...options, signal },
    );

    await step("Saving the plan");
    const planId = await createLearningPlan({
      ...(posting ? { postingId: posting.id } : {}),
      ...(target ? { targetId: target.id } : {}),
      goal: goal.trim(),
      generated: data,
      plannedWith: promptVersion,
    });
    return { planId };
  },
});
