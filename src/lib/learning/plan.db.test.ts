import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LearningStatus } from "@/generated/prisma/enums";
import type { LearningPlanResult } from "@/lib/ai/task-contracts";
import { createTestClient, resetDatabase } from "@/test/db";

import { createPlan, deletePlan, getPlan, listPlans, planProgress, setTopicStatus } from "./plan";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

const generated = (topics: Partial<LearningPlanResult["topics"][number]>[] = [{}, {}]): LearningPlanResult => ({
  schema_version: "1.0",
  task: "learning_plan",
  goal: "Ready for Senior AI Backend Engineer interviews",
  topics: topics.map((overrides, index) => ({
    title: `Topic ${index + 1}`,
    prerequisites: index === 0 ? [] : [`Topic ${index}`],
    effortHours: 4,
    exercises: ["Build a small RAG service"],
    miniProjects: ["A retrieval evaluation harness"],
    interviewQuestions: ["How would you evaluate a RAG system?"],
    resources: ["Vector databases"],
    ...overrides,
  })),
});

describe("learning plans", () => {
  it("persists a plan and its topics in sequence order", async () => {
    const posting = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "job-1" } });
    const target = await prisma().careerTarget.create({ data: { title: "Senior AI Backend Engineer", preferences: {} } });
    const planId = await createPlan({ postingId: posting.id, targetId: target.id, goal: "", generated: generated(), plannedWith: "learning-plan@1" });

    const plan = await getPlan(planId);
    expect(plan).toMatchObject({ goal: "Ready for Senior AI Backend Engineer interviews", plannedWith: "learning-plan@1", postingId: posting.id, targetId: target.id });
    expect(plan!.topics.map((topic) => [topic.sequence, topic.title, topic.effortHours, topic.prerequisites])).toEqual([
      [0, "Topic 1", 4, []],
      [1, "Topic 2", 4, ["Topic 1"]],
    ]);
    expect(plan!.topics[0]).toMatchObject({
      exercises: ["Build a small RAG service"],
      miniProjects: ["A retrieval evaluation harness"],
      interviewQuestions: ["How would you evaluate a RAG system?"],
      resources: ["Vector databases"],
      status: LearningStatus.NOT_STARTED,
      completedAt: null,
    });
  });

  it("rounds half hours and keeps the first topic's status open", async () => {
    const planId = await createPlan({ goal: "G", generated: generated([{ effortHours: 2.5 }]), plannedWith: "learning-plan@1" });
    expect((await getPlan(planId))!.topics[0]).toMatchObject({ effortHours: 3 });
  });

  it("lists plans newest first with topic counts", async () => {
    await createPlan({ goal: "First", generated: generated(), plannedWith: "learning-plan@1" });
    await createPlan({ goal: "Second", generated: generated([{}, {}, {}]), plannedWith: "learning-plan@1" });
    expect((await listPlans()).map((plan) => [plan.goal, plan.topicCount])).toEqual([["Second", 3], ["First", 2]]);
  });

  it("moves a topic along its statuses, stamping the date on COMPLETED only", async () => {
    const planId = await createPlan({ goal: "G", generated: generated(), plannedWith: "learning-plan@1" });
    const plan = await getPlan(planId);
    const topicId = plan!.topics[0]!.id;

    await setTopicStatus(topicId, LearningStatus.LEARNING);
    expect(await prisma().learningTopic.findUniqueOrThrow({ where: { id: topicId } })).toMatchObject({ status: LearningStatus.LEARNING, completedAt: null });

    await setTopicStatus(topicId, LearningStatus.COMPLETED);
    const completed = await prisma().learningTopic.findUniqueOrThrow({ where: { id: topicId } });
    expect(completed).toMatchObject({ status: LearningStatus.COMPLETED, completedAt: expect.any(Date) });

    // Moving it back clears the date.
    await setTopicStatus(topicId, LearningStatus.NEEDS_REVISION);
    expect(await prisma().learningTopic.findUniqueOrThrow({ where: { id: topicId } })).toMatchObject({ status: LearningStatus.NEEDS_REVISION, completedAt: null });
  });

  it("counts the topics per status", async () => {
    const planId = await createPlan({ goal: "G", generated: generated([{}, {}, {}]), plannedWith: "learning-plan@1" });
    const plan = await getPlan(planId);
    await setTopicStatus(plan!.topics[0]!.id, LearningStatus.LEARNING);
    await setTopicStatus(plan!.topics[1]!.id, LearningStatus.COMPLETED);
    await setTopicStatus(plan!.topics[2]!.id, LearningStatus.COMPLETED);

    expect(await planProgress(planId)).toEqual({ NOT_STARTED: 0, LEARNING: 1, PRACTICING: 0, COMPLETED: 2, NEEDS_REVISION: 0, total: 3 });
    expect(await planProgress("missing")).toEqual({ NOT_STARTED: 0, LEARNING: 0, PRACTICING: 0, COMPLETED: 0, NEEDS_REVISION: 0, total: 0 });
  });

  it("deletes a plan and its topics with it", async () => {
    const planId = await createPlan({ goal: "G", generated: generated(), plannedWith: "learning-plan@1" });
    await deletePlan(planId);
    expect(await prisma().learningPlan.count()).toBe(0);
    expect(await prisma().learningTopic.count()).toBe(0);
  });
});
