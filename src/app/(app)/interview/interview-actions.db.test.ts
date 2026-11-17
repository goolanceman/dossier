import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MockProvider } from "@/lib/ai/providers/mock";
import { getJob } from "@/lib/jobs/runner";
import { createPlan as createInterviewPlan } from "@/lib/interview/plans";
import { createTestClient, resetDatabase } from "@/test/db";

import {
  generateLearningPlan,
  generatePlan,
  recordMockTurn,
  removeStarStory,
  saveStarStory,
  setQuestionPrepared,
  setTopicStatus,
  startMock,
  submitMockAnswer,
  suggestStories,
} from "./actions";

// The interview actions run against the test database, signed in. The AI
// behind the jobs is a mock that answers in the interview_preparation,
// mock_feedback and learning_plan schemas, chosen by the schema each call
// asks for.

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ persistent: false, issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "[redacted]]".repeat(32) } }));
vi.mock("@/lib/ai/routing", async () => ({
  getProviderForTask: async () =>
    new MockProvider({
      reply: (call) => {
        if (call.json?.name === "mock_feedback") {
          return {
            schema_version: "1.0",
            task: "mock_feedback",
            technicalAccuracy: 80,
            structure: 70,
            depth: 60,
            communication: 90,
            evidenceUse: 50,
            strengths: ["Clear structure"],
            improvements: ["Add numbers"],
            suggestedAnswerPoints: ["Start with the outcome"],
          };
        }
        if (call.json?.name === "learning_plan") {
          return {
            schema_version: "1.0",
            task: "learning_plan",
            goal: "Learn Kafka",
            topics: [
              {
                title: "Kafka basics",
                prerequisites: [],
                effortHours: 3,
                exercises: ["Run a local broker"],
                miniProjects: [],
                interviewQuestions: ["What is a partition?"],
                resources: ["Kafka intro"],
              },
            ],
          };
        }
        return {
          schema_version: "1.0",
          task: "interview_preparation",
          role: "Senior Backend Engineer",
          preparationTopics: ["Kafka internals"],
          readiness: { score: null, confidence: "MEDIUM", reasoning: "Depends on preparation" },
          questions: [
            {
              id: "q1",
              category: "TECHNICAL",
              difficulty: "ADVANCED",
              question: "How would you design a rate limiter?",
              whyAsked: "It is on the JD",
              relatedRequirement: "",
              expectedTopics: ["token bucket"],
              answerStructure: ["define", "example"],
              evidenceIds: ["ach-1"],
              followUps: ["What about a cluster?"],
              commonMistakes: ["Ignoring the clock"],
              resources: ["Rate limiting patterns"],
            },
            {
              id: "q2",
              category: "BEHAVIORAL",
              difficulty: "INTERMEDIATE",
              question: "Tell me about a migration you led.",
              whyAsked: "It shows delivery",
              relatedRequirement: "",
              expectedTopics: ["Kafka"],
              answerStructure: ["situation", "result"],
              evidenceIds: [],
              followUps: [],
              commonMistakes: [],
              resources: [],
            },
          ],
        };
      },
    }),
}));

const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

/** Waits for a background job to end, and asserts it ended done. The first run of a suite imports the whole job-definitions cascade, which can take a while. */
async function awaitJob(jobId: string) {
  for (let waited = 0; waited < 500; waited++) {
    const job = await getJob(jobId);
    if (job && (job.status === "DONE" || job.status === "FAILED")) return job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Job ${jobId} never finished.`);
}

describe("interview plan actions (master.md §7.1–7.3)", () => {
  it("generates a plan in the background over the five default rounds, with its questions", async () => {
    const result = await generatePlan({ role: "Senior Backend Engineer" });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.error);
    const job = await awaitJob(result.data.jobId);
    expect(job.status).toBe("DONE");

    const plan = await prisma().interviewPlan.findFirst({ include: { questions: true } });
    expect(plan).toMatchObject({ role: "Senior Backend Engineer", preparedWith: "interview-prep@1" });
    expect(plan?.questions).toHaveLength(2);
    // createManyAndReturn may hand the rows back in any order; the technical
    // one is found by its category, the way the screen filters them.
    const technical = plan?.questions.find((question) => question.category === "TECHNICAL");
    expect(technical).toMatchObject({ prepared: false });
    // The mock's evidence id points at an empty library, so it is dropped.
    expect(technical?.evidenceIds).toEqual([]);
  });

  it("marks a question prepared and back again", async () => {
    const { questionIds } = await createInterviewPlan({
      role: "Senior Backend Engineer",
      rounds: [{ name: "Technical", focus: "Core skills" }],
      generated: {
        schema_version: "1.0",
        task: "interview_preparation",
        role: "Senior Backend Engineer",
        preparationTopics: [],
        readiness: { score: null, confidence: "LOW", reasoning: "" },
        questions: [
          {
            id: "q1",
            category: "TECHNICAL",
            difficulty: "ADVANCED",
            question: "How would you design a rate limiter?",
            whyAsked: "",
            relatedRequirement: "",
            expectedTopics: [],
            answerStructure: [],
            evidenceIds: [],
            followUps: [],
            commonMistakes: [],
            resources: [],
          },
        ],
      },
      preparedWith: "interview-prep@1",
    });
    expect(await setQuestionPrepared({ questionId: questionIds[0]!, prepared: true })).toEqual({ ok: true, data: null });
    expect(await prisma().interviewQuestion.findUniqueOrThrow({ where: { id: questionIds[0]! } })).toMatchObject({ prepared: true });
    expect(await setQuestionPrepared({ questionId: questionIds[0]!, prepared: false })).toEqual({ ok: true, data: null });
    expect(await prisma().interviewQuestion.findUniqueOrThrow({ where: { id: questionIds[0]! } })).toMatchObject({ prepared: false });
  });
});

describe("mock interview actions (master.md §7.5)", () => {
  it("refuses to start with no questions to ask, honestly", async () => {
    await expect(startMock({ kind: "TEXT" })).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Generate an interview plan first") });
  });

  it("grades a text answer as a job: turn kept, verdict recorded, session completed", async () => {
    const { planId } = await createInterviewPlan({
      role: "Senior Backend Engineer",
      rounds: [{ name: "Technical", focus: "Core skills" }],
      generated: {
        schema_version: "1.0",
        task: "interview_preparation",
        role: "Senior Backend Engineer",
        preparationTopics: [],
        readiness: { score: null, confidence: "LOW", reasoning: "" },
        questions: [
          {
            id: "q1",
            category: "TECHNICAL",
            difficulty: "ADVANCED",
            question: "How would you design a rate limiter?",
            whyAsked: "",
            relatedRequirement: "",
            expectedTopics: ["token bucket"],
            answerStructure: ["define the mechanism"],
            evidenceIds: [],
            followUps: [],
            commonMistakes: [],
            resources: [],
          },
        ],
      },
      preparedWith: "interview-prep@1",
    });
    const opened = await startMock({ kind: "TEXT", planId });
    expect(opened).toMatchObject({ ok: true });
    if (!opened.ok) throw new Error(opened.error);

    const submitted = await submitMockAnswer({ sessionId: opened.data.sessionId, question: "How would you design a rate limiter?", answer: "Token bucket in Redis." });
    expect(submitted).toMatchObject({ ok: true });
    if (!submitted.ok) throw new Error(submitted.error);
    const job = await awaitJob(submitted.data.jobId);
    expect(job.status).toBe("DONE");

    const session = await prisma().mockSession.findUniqueOrThrow({ where: { id: opened.data.sessionId } });
    // (80 + 70 + 60 + 90 + 50) / 5 = 70
    expect(session).toMatchObject({ status: "COMPLETED", score: 70 });
    const turns = session.turns as { question: string; answer: string; feedback: object }[];
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ question: "How would you design a rate limiter?", answer: "Token bucket in Redis." });
    expect(turns[0].feedback).toMatchObject({ strengths: ["Clear structure"] });
  });

  it("records a technical answer without grading it", async () => {
    const { planId } = await createInterviewPlan({
      role: "Senior Backend Engineer",
      rounds: [{ name: "Technical", focus: "Core skills" }],
      generated: {
        schema_version: "1.0",
        task: "interview_preparation",
        role: "Senior Backend Engineer",
        preparationTopics: [],
        readiness: { score: null, confidence: "LOW", reasoning: "" },
        questions: [
          {
            id: "q1",
            category: "TECHNICAL",
            difficulty: "ADVANCED",
            question: "Design a URL shortener.",
            whyAsked: "",
            relatedRequirement: "",
            expectedTopics: [],
            answerStructure: [],
            evidenceIds: [],
            followUps: [],
            commonMistakes: [],
            resources: [],
          },
        ],
      },
      preparedWith: "interview-prep@1",
    });
    const opened = await startMock({ kind: "TECHNICAL", planId });
    if (!opened.ok) throw new Error(opened.error);
    expect(await recordMockTurn({ sessionId: opened.data.sessionId, question: "Design a URL shortener.", answer: "Base62 keys over Postgres." })).toEqual({ ok: true, data: null });
    const session = await prisma().mockSession.findUniqueOrThrow({ where: { id: opened.data.sessionId } });
    expect(session).toMatchObject({ kind: "TECHNICAL", status: "IN_PROGRESS", score: null, feedback: null });
    expect(session.turns).toHaveLength(1);
  });
});

describe("learning plan actions (master.md Phase 8)", () => {
  it("generates a plan in the background and moves its topics along", async () => {
    const result = await generateLearningPlan({ goal: "Learn Kafka" });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.error);
    const job = await awaitJob(result.data.jobId);
    expect(job.status).toBe("DONE");

    const plan = await prisma().learningPlan.findFirst({ include: { topics: true } });
    expect(plan).toMatchObject({ goal: "Learn Kafka", plannedWith: "learning-plan@1" });
    const topic = plan?.topics[0];
    expect(topic).toMatchObject({ title: "Kafka basics", status: "NOT_STARTED", completedAt: null });

    expect(await setTopicStatus({ topicId: topic!.id, status: "COMPLETED" })).toEqual({ ok: true, data: null });
    const completed = await prisma().learningTopic.findUniqueOrThrow({ where: { id: topic!.id } });
    expect(completed).toMatchObject({ status: "COMPLETED" });
    expect(completed.completedAt).not.toBeNull();

    // Moving a topic back clears its completion date.
    expect(await setTopicStatus({ topicId: topic!.id, status: "LEARNING" })).toEqual({ ok: true, data: null });
    expect(await prisma().learningTopic.findUniqueOrThrow({ where: { id: topic!.id } })).toMatchObject({ status: "LEARNING", completedAt: null });
  });
});

describe("STAR story actions (master.md §7.4)", () => {
  it("saves a story, suggests it for a matching question, and removes it", async () => {
    const saved = await saveStarStory({
      title: "The Kafka migration",
      situation: "Monolith was falling over",
      task: "Move 40 services off it",
      action: "Strangler pattern over six months",
      result: "Zero-downtime cutover",
      technologies: ["Kafka"],
      businessImpact: "Checkout latency halved",
      skills: ["Distributed systems"],
      achievementId: null,
      questionIds: [],
    });
    expect(saved).toMatchObject({ ok: true, data: { title: "The Kafka migration" } });
    if (!saved.ok) throw new Error(saved.error);

    const { questionIds } = await createInterviewPlan({
      role: "Senior Backend Engineer",
      rounds: [{ name: "Technical", focus: "Core skills" }],
      generated: {
        schema_version: "1.0",
        task: "interview_preparation",
        role: "Senior Backend Engineer",
        preparationTopics: [],
        readiness: { score: null, confidence: "LOW", reasoning: "" },
        questions: [
          {
            id: "q1",
            category: "TECHNICAL",
            difficulty: "ADVANCED",
            question: "Tell me about a migration.",
            whyAsked: "",
            relatedRequirement: "",
            expectedTopics: ["Kafka"],
            answerStructure: [],
            evidenceIds: [],
            followUps: [],
            commonMistakes: [],
            resources: [],
          },
        ],
      },
      preparedWith: "interview-prep@1",
    });
    expect(await suggestStories({ questionId: questionIds[0]! })).toMatchObject({ ok: true, data: [{ id: saved.data.id, title: "The Kafka migration" }] });

    expect(await removeStarStory({ id: saved.data.id })).toEqual({ ok: true, data: null });
    expect(await prisma().starStory.count()).toBe(0);
  });
});
