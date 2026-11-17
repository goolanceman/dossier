import "server-only";

import type { LearningPlan, LearningTopic } from "@/generated/prisma/client";
import { LearningStatus } from "@/generated/prisma/enums";
import type { LearningPlanResult } from "@/lib/ai/task-contracts";
import { prisma } from "@/lib/prisma";

// Learning plans (master.md Phase 8): the topics to learn for a target, in
// the order the validated learning_plan contract wrote them. The plan is a
// schedule, not a promise; effort estimates come from the model and the user
// moves the topics along.

/** Persists a plan and its topics; a topic's sequence is its place in the list. */
export async function createPlan(input: {
  postingId?: string;
  targetId?: string;
  goal: string;
  generated: LearningPlanResult;
  plannedWith: string;
}): Promise<string> {
  const plan = await prisma.learningPlan.create({
    data: {
      postingId: input.postingId ?? null,
      targetId: input.targetId ?? null,
      goal: input.goal || input.generated.goal,
      plannedWith: input.plannedWith,
      topics: {
        create: input.generated.topics.map((topic, sequence) => ({
          title: topic.title,
          prerequisites: topic.prerequisites,
          sequence,
          // The contract allows half hours; the column counts whole hours.
          effortHours: Math.round(topic.effortHours),
          exercises: topic.exercises,
          miniProjects: topic.miniProjects,
          interviewQuestions: topic.interviewQuestions,
          resources: topic.resources,
        })),
      },
    },
  });
  return plan.id;
}

/** The plans, newest first, with how many topics each has. */
export async function listPlans(): Promise<(LearningPlan & { topicCount: number })[]> {
  const rows = await prisma.learningPlan.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { topics: true } } },
  });
  return rows.map(({ _count, ...plan }) => ({ ...plan, topicCount: _count.topics }));
}

export async function getPlan(id: string): Promise<(LearningPlan & { topics: LearningTopic[] }) | null> {
  return prisma.learningPlan.findUnique({ where: { id }, include: { topics: { orderBy: { sequence: "asc" } } } });
}

export async function setTopicStatus(topicId: string, status: LearningStatus): Promise<void> {
  // COMPLETED is the only status with a date; moving a topic back clears it.
  await prisma.learningTopic.update({
    where: { id: topicId },
    data: { status, completedAt: status === LearningStatus.COMPLETED ? new Date() : null },
  });
}

export async function deletePlan(id: string): Promise<void> {
  await prisma.learningPlan.delete({ where: { id } });
}

/** How many topics stand at each status, and how many there are. */
export async function planProgress(planId: string): Promise<Record<LearningStatus, number> & { total: number }> {
  const grouped = await prisma.learningTopic.groupBy({ by: ["status"], where: { planId }, _count: true });
  const counts: Record<LearningStatus, number> = {
    NOT_STARTED: 0,
    LEARNING: 0,
    PRACTICING: 0,
    COMPLETED: 0,
    NEEDS_REVISION: 0,
  };
  for (const row of grouped) counts[row.status] = row._count;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { ...counts, total };
}
