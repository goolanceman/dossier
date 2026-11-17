import "server-only";

import type { GapQuestion, Prisma } from "@/generated/prisma/client";
import { GapQuestionStatus } from "@/generated/prisma/enums";
import type { GapQuestions } from "@/lib/ai/task-contracts";
import { createAchievement, type AchievementInput } from "@/lib/career/achievements";
import { prisma } from "@/lib/prisma";

// The gap questions workflow (master.md Phase 6): what only the candidate
// knows, asked before anything is written on it. Questions are never invented
// here; they arrive from the validated gap_questions task contract.

/** Priority as the schema stores it, ranked so the sharpest questions come first. */
const priorityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Question text folded down to one comparable form, so case and spacing can't make a duplicate. */
function normalize(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Persists the generated questions for a posting or application and returns
 * their ids. What the profile already answers is dropped (master.md §6), and
 * a question asked again while still open for the same scope is not stored twice.
 */
export async function createGapQuestions(input: {
  postingId?: string;
  applicationId?: string;
  generated: GapQuestions;
  generatedWith: string;
}): Promise<string[]> {
  const scope = { postingId: input.postingId ?? null, applicationId: input.applicationId ?? null };
  const open = await prisma.gapQuestion.findMany({
    where: { ...scope, status: GapQuestionStatus.OPEN },
    select: { question: true },
  });
  const asked = new Set(open.map((row) => normalize(row.question)));
  const data: Prisma.GapQuestionCreateManyInput[] = [];
  for (const question of input.generated.questions) {
    // What the profile already answers is not asked, whatever the model said.
    if (question.alreadyKnown) continue;
    const key = normalize(question.question);
    if (asked.has(key)) continue;
    asked.add(key);
    // expectedInformation stays out: it is prompt material, not a column.
    data.push({
      ...scope,
      question: question.question,
      reason: question.reason,
      relatedRequirement: question.relatedRequirement,
      questionType: question.questionType,
      priority: question.priority,
      generatedWith: input.generatedWith,
    });
  }
  if (data.length === 0) return [];
  const rows = await prisma.gapQuestion.createManyAndReturn({ data });
  return rows.map((row) => row.id);
}

/** The user answered; the answer is kept as written (master.md §6). */
export async function answerQuestion(id: string, answer: string): Promise<void> {
  await prisma.gapQuestion.update({
    where: { id },
    data: { status: GapQuestionStatus.ANSWERED, answer, answeredAt: new Date() },
  });
}

export async function skipQuestion(id: string): Promise<void> {
  await prisma.gapQuestion.update({ where: { id }, data: { status: GapQuestionStatus.SKIPPED } });
}

export async function markUnknown(id: string): Promise<void> {
  await prisma.gapQuestion.update({ where: { id }, data: { status: GapQuestionStatus.UNKNOWN } });
}

export async function saveForLater(id: string): Promise<void> {
  await prisma.gapQuestion.update({ where: { id }, data: { status: GapQuestionStatus.SAVED_FOR_LATER } });
}

/**
 * Turns an answer into a career achievement and links it to the question. The
 * achievement records where it came from, and the answer itself stays on the
 * question (master.md §6 "Preserve the original answer and its source"). This
 * only adds: previously verified facts are never touched.
 */
export async function confirmAnswerAsEvidence(id: string, achievementInput: AchievementInput): Promise<string> {
  const question = await prisma.gapQuestion.findUniqueOrThrow({ where: { id } });
  if (question.answer.trim() === "") throw new Error("Only an answered question can become evidence.");
  const achievement = await createAchievement(achievementInput, { origin: `gap-question:${id}` });
  await prisma.gapQuestion.update({ where: { id }, data: { achievementId: achievement.id } });
  return achievement.id;
}

/** The questions for a posting, application or status, sharpest first, then oldest first. */
export async function listGapQuestions({ postingId, applicationId, status }: { postingId?: string; applicationId?: string; status?: GapQuestionStatus } = {}): Promise<GapQuestion[]> {
  const rows = await prisma.gapQuestion.findMany({
    where: {
      ...(postingId !== undefined ? { postingId } : {}),
      ...(applicationId !== undefined ? { applicationId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  // Postgres can't rank a text priority, so rows arrive by date and a stable
  // sort by rank leaves them priority first, date second.
  return rows.sort((a, b) => (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4));
}
