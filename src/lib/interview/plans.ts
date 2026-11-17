import "server-only";

import { z } from "zod";

import type { InterviewPlan, InterviewQuestion, StarStory } from "@/generated/prisma/client";
import type { InterviewPrep } from "@/lib/ai/task-contracts";
import { stringsOf } from "@/lib/agent/candidates";
import { prisma } from "@/lib/prisma";

// Interview plans and the STAR story bank (master.md §7.1–7.4). Questions
// arrive from the validated interview_preparation task contract; the evidence
// ids they claim are kept as given and checked against the library when the
// plan is shown, not here.

/** Create/update input for a STAR story; the JSON lists are plain string lists. */
export const starStoryInputSchema = z.object({
  title: z.string().min(1).max(300),
  situation: z.string().max(4_000).default(""),
  task: z.string().max(4_000).default(""),
  action: z.string().max(4_000).default(""),
  result: z.string().max(4_000).default(""),
  technologies: z.array(z.string().max(100)).max(20).default([]),
  businessImpact: z.string().max(2_000).default(""),
  skills: z.array(z.string().max(100)).max(20).default([]),
  achievementId: z.string().max(50).nullable().default(null),
  questionIds: z.array(z.string().max(50)).max(30).default([]),
});
export type StarStoryInput = z.output<typeof starStoryInputSchema>;

/** A stored story with its JSON columns read back as data. */
export type StarStoryView = Omit<StarStory, "technologies" | "skills" | "questionIds"> & {
  technologies: string[];
  skills: string[];
  questionIds: string[];
};

function toStoryView(row: StarStory): StarStoryView {
  return { ...row, technologies: stringsOf(row.technologies), skills: stringsOf(row.skills), questionIds: stringsOf(row.questionIds) };
}

/**
 * Persists a plan and its questions, in the order the model wrote them. The
 * id order also breaks createdAt ties in getPlan: ids from one client sort in
 * creation order, and all rows of one statement share a timestamp.
 */
export async function createPlan(input: {
  postingId?: string;
  applicationId?: string;
  role: string;
  rounds: { name: string; focus: string }[];
  generated: InterviewPrep;
  preparedWith: string;
}): Promise<{ planId: string; questionIds: string[] }> {
  const plan = await prisma.interviewPlan.create({
    data: {
      postingId: input.postingId ?? null,
      applicationId: input.applicationId ?? null,
      role: input.role || input.generated.role,
      rounds: input.rounds,
      preparedWith: input.preparedWith,
    },
  });
  const rows = await prisma.interviewQuestion.createManyAndReturn({
    data: input.generated.questions.map((question) => ({
      planId: plan.id,
      category: question.category,
      difficulty: question.difficulty,
      question: question.question,
      whyAsked: question.whyAsked,
      relatedRequirement: question.relatedRequirement,
      expectedTopics: question.expectedTopics,
      answerStructure: question.answerStructure,
      evidenceIds: question.evidenceIds,
      followUps: question.followUps,
      commonMistakes: question.commonMistakes,
      resources: question.resources,
    })),
  });
  return { planId: plan.id, questionIds: rows.map((row) => row.id) };
}

/** The plans, newest first, with how many questions each has. */
export async function listPlans(): Promise<(InterviewPlan & { questionCount: number })[]> {
  const rows = await prisma.interviewPlan.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true } } },
  });
  return rows.map(({ _count, ...plan }) => ({ ...plan, questionCount: _count.questions }));
}

export async function getPlan(id: string): Promise<(InterviewPlan & { questions: InterviewQuestion[] }) | null> {
  return prisma.interviewPlan.findUnique({
    where: { id },
    include: { questions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
}

export async function markPrepared(questionId: string, prepared: boolean): Promise<void> {
  await prisma.interviewQuestion.update({ where: { id: questionId }, data: { prepared } });
}

export async function deletePlan(id: string): Promise<void> {
  await prisma.interviewPlan.delete({ where: { id } });
}

export async function listStarStories(): Promise<StarStoryView[]> {
  const rows = await prisma.starStory.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map(toStoryView);
}

export async function createStarStory(input: StarStoryInput): Promise<StarStoryView> {
  return toStoryView(await prisma.starStory.create({ data: input }));
}

export async function updateStarStory(id: string, input: Partial<StarStoryInput>): Promise<StarStoryView> {
  // Dropped keys keep their stored value; undefined may not overwrite one.
  const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  return toStoryView(await prisma.starStory.update({ where: { id }, data }));
}

export async function deleteStarStory(id: string): Promise<void> {
  await prisma.starStory.delete({ where: { id } });
}

/**
 * The stories that can answer a question, best first: every expected topic
 * that appears in the story's skills or technologies counts, and stories with
 * none are left out. A plain match on the stored string lists, case-blind;
 * no AI and no fuzzy matching.
 */
export async function suggestStoriesForQuestion(questionId: string): Promise<StarStoryView[]> {
  const question = await prisma.interviewQuestion.findUniqueOrThrow({ where: { id: questionId } });
  const topics = new Set(stringsOf(question.expectedTopics).map((topic) => topic.toLowerCase()));
  const stories = await listStarStories();
  return stories
    .map((story) => ({
      story,
      shared: [...story.skills, ...story.technologies].filter((entry) => topics.has(entry.toLowerCase())).length,
    }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .map(({ story }) => story);
}
