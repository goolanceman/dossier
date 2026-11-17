import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { InterviewPrep } from "@/lib/ai/task-contracts";
import { createTestClient, resetDatabase } from "@/test/db";

import { createPlan, createStarStory, deletePlan, deleteStarStory, getPlan, listPlans, listStarStories, markPrepared, suggestStoriesForQuestion, updateStarStory } from "./plans";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

const prep = (questions: Partial<InterviewPrep["questions"][number]>[] = [{}]): InterviewPrep => ({
  schema_version: "1.0",
  task: "interview_preparation",
  role: "Senior Backend Engineer",
  preparationTopics: ["Kafka internals"],
  readiness: { score: null, confidence: "MEDIUM", reasoning: "Depends on preparation" },
  questions: questions.map((overrides, index) => ({
    id: `q${index + 1}`,
    category: "TECHNICAL",
    difficulty: "ADVANCED",
    question: `Question ${index + 1}?`,
    whyAsked: "It is on the JD",
    relatedRequirement: "Kafka",
    expectedTopics: ["partitioning", "consumer groups"],
    answerStructure: ["definition", "example"],
    evidenceIds: ["ach-1"],
    followUps: ["What about rebalancing?"],
    commonMistakes: ["Ignoring lag"],
    resources: ["Kafka: The Definitive Guide"],
    ...overrides,
  })),
});

const story = (overrides: Partial<Parameters<typeof createStarStory>[0]> = {}) => ({
  title: "The Kafka migration",
  situation: "Monolith was falling over",
  task: "Move 40 services off it",
  action: "Strangler pattern over six months",
  result: "Zero-downtime cutover",
  technologies: ["Kafka", "Redis"],
  businessImpact: "Checkout latency halved",
  skills: ["Distributed systems"],
  achievementId: null,
  questionIds: [],
  ...overrides,
});

describe("interview plans", () => {
  it("persists the plan and its questions with their lists kept as given", async () => {
    const posting = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "job-1" } });
    const { planId, questionIds } = await createPlan({
      postingId: posting.id,
      role: "Senior Backend Engineer at Example Co",
      rounds: [{ name: "Recruiter", focus: "Screening" }, { name: "System design", focus: "Architecture" }],
      generated: prep(),
      preparedWith: "interview-preparation@1",
    });
    expect(questionIds).toHaveLength(1);
    const plan = await getPlan(planId);
    expect(plan).toMatchObject({
      role: "Senior Backend Engineer at Example Co",
      rounds: [{ name: "Recruiter", focus: "Screening" }, { name: "System design", focus: "Architecture" }],
      preparedWith: "interview-preparation@1",
      postingId: posting.id,
    });
    expect(plan!.questions[0]).toMatchObject({
      category: "TECHNICAL",
      difficulty: "ADVANCED",
      whyAsked: "It is on the JD",
      expectedTopics: ["partitioning", "consumer groups"],
      evidenceIds: ["ach-1"],
      prepared: false,
    });
  });

  it("falls back to the generated role and keeps the question order", async () => {
    const { planId, questionIds } = await createPlan({ role: "", rounds: [], generated: prep([{}, {}, { question: "Question 2b?" }]), preparedWith: "interview-preparation@1" });
    expect((await getPlan(planId))!.role).toBe("Senior Backend Engineer");
    const plan = await getPlan(planId);
    expect(plan!.questions.map((row) => row.question)).toEqual(["Question 1?", "Question 2?", "Question 2b?"]);
    expect(questionIds).toHaveLength(3);
  });

  it("marks a question prepared and lists plans newest first with question counts", async () => {
    const first = await createPlan({ role: "A", rounds: [], generated: prep([{}, {}]), preparedWith: "interview-preparation@1" });
    await createPlan({ role: "B", rounds: [], generated: prep(), preparedWith: "interview-preparation@1" });
    await markPrepared(first.questionIds[0]!, true);

    expect(await prisma().interviewQuestion.findUniqueOrThrow({ where: { id: first.questionIds[0]! } })).toMatchObject({ prepared: true });
    expect(await prisma().interviewQuestion.findUniqueOrThrow({ where: { id: first.questionIds[1]! } })).toMatchObject({ prepared: false });
    expect((await listPlans()).map((plan) => [plan.role, plan.questionCount])).toEqual([["B", 1], ["A", 2]]);
  });

  it("deletes a plan and its questions with it", async () => {
    const { planId } = await createPlan({ role: "A", rounds: [], generated: prep(), preparedWith: "interview-preparation@1" });
    await deletePlan(planId);
    expect(await prisma().interviewPlan.count()).toBe(0);
    expect(await prisma().interviewQuestion.count()).toBe(0);
  });
});

describe("the STAR story bank", () => {
  it("keeps stories and reads their lists back", async () => {
    const achievement = await prisma().careerAchievement.create({ data: { title: "The migration", technologies: [], metrics: [], tags: [], skills: [], versions: [] } });
    const saved = await createStarStory({ ...story(), achievementId: achievement.id, questionIds: ["q1", "q2"] });
    expect(saved).toMatchObject({ title: "The Kafka migration", technologies: ["Kafka", "Redis"], skills: ["Distributed systems"], questionIds: ["q1", "q2"] });
    expect((await listStarStories()).map((row) => row.title)).toEqual(["The Kafka migration"]);
  });

  it("updates the given fields and keeps the rest, and deletes", async () => {
    const saved = await createStarStory(story());
    const updated = await updateStarStory(saved.id, { result: "Latency halved, no rollbacks", skills: ["Distributed systems", "Kafka"] });
    expect(updated).toMatchObject({ result: "Latency halved, no rollbacks", skills: ["Distributed systems", "Kafka"], situation: "Monolith was falling over" });
    await deleteStarStory(saved.id);
    expect(await listStarStories()).toEqual([]);
  });

  it("suggests stories whose skills or technologies share an expected topic, best match first", async () => {
    const { questionIds } = await createPlan({ role: "R", rounds: [], generated: prep([{ expectedTopics: ["Kafka", "PostgreSQL"] }]), preparedWith: "interview-preparation@1" });
    await createStarStory(story({ title: "Both", skills: ["PostgreSQL"], technologies: ["Kafka"] }));
    await createStarStory(story({ title: "One", skills: ["Kafka"], technologies: ["Redis"] }));
    await createStarStory(story({ title: "None", skills: ["React"], technologies: ["Tailwind"] }));

    expect((await suggestStoriesForQuestion(questionIds[0]!)).map((row) => row.title)).toEqual(["Both", "One"]);
  });
});
