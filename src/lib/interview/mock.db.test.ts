import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MockKind, MockStatus } from "@/generated/prisma/enums";
import type { MockFeedback } from "@/lib/ai/task-contracts";
import { createTestClient, resetDatabase } from "@/test/db";

import { abandonSession, addTurn, getSession, listSessions, recordFeedback, startSession } from "./mock";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

const feedback = (over: Partial<MockFeedback> = {}): MockFeedback => ({
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
  ...over,
});

describe("mock sessions", () => {
  it("opens a session with no turns and no feedback", async () => {
    const opened = await startSession({ kind: MockKind.TECHNICAL });
    expect(opened).toMatchObject({ kind: MockKind.TECHNICAL, status: MockStatus.IN_PROGRESS, turns: [], feedback: null, score: null, planId: null });
  });

  it("appends turns one question at a time, without feedback", async () => {
    const opened = await startSession({ kind: MockKind.BEHAVIORAL });
    await addTurn(opened.id, { question: "Tell me about a migration.", answer: "We moved 40 services." });
    const afterSecond = await addTurn(opened.id, { question: "What broke?", answer: "Nothing, we shadowed first." });
    expect(afterSecond.turns).toEqual([
      { question: "Tell me about a migration.", answer: "We moved 40 services.", feedback: null },
      { question: "What broke?", answer: "Nothing, we shadowed first.", feedback: null },
    ]);
    expect(afterSecond.feedback).toBeNull();
  });

  it("records the feedback, scores the rounded mean of the five dimensions, and finishes the session", async () => {
    const opened = await startSession({ kind: MockKind.SYSTEM_DESIGN });
    await addTurn(opened.id, { question: "Design a rate limiter.", answer: "Token bucket in Redis." });
    const finished = await recordFeedback(opened.id, feedback());
    // (80 + 70 + 60 + 90 + 50) / 5 = 70
    expect(finished).toMatchObject({ status: MockStatus.COMPLETED, score: 70, finishedAt: expect.any(Date) });
    expect(finished.feedback).toMatchObject({ strengths: ["Clear structure"], improvements: ["Add numbers"] });
    // The verdict also lands on the last turn, so it reads alone.
    expect(finished.turns[0]).toMatchObject({ question: "Design a rate limiter.", feedback: { technicalAccuracy: 80 } });

    const stored = await getSession(opened.id);
    expect(stored).toMatchObject({ status: MockStatus.COMPLETED, score: 70 });
  });

  it("rounds a mean that lands between whole numbers", async () => {
    const opened = await startSession({ kind: MockKind.TEXT });
    const finished = await recordFeedback(opened.id, feedback({ technicalAccuracy: 81, structure: 70, depth: 60, communication: 90, evidenceUse: 50 }));
    expect(finished.score).toBe(70); // 70.2 rounds down to 70
  });

  it("refuses feedback when the caller was aborted", async () => {
    const opened = await startSession({ kind: MockKind.TEXT });
    const controller = new AbortController();
    controller.abort();
    await expect(recordFeedback(opened.id, feedback(), { signal: controller.signal })).rejects.toThrow();
    expect(await prisma().mockSession.findUniqueOrThrow({ where: { id: opened.id } })).toMatchObject({ status: MockStatus.IN_PROGRESS, feedback: null });
  });

  it("abandons a session and lists sessions by status, newest first", async () => {
    const first = await startSession({ kind: MockKind.TEXT });
    const plan = await prisma().interviewPlan.create({ data: { role: "Backend Engineer", rounds: [] } });
    const second = await startSession({ planId: plan.id, kind: MockKind.TECHNICAL });
    const finished = await recordFeedback((await startSession({ kind: MockKind.TEXT })).id, feedback());
    await abandonSession(first.id);
    // Start dates spaced apart, so the newest-first order can't tie.
    await prisma().mockSession.update({ where: { id: first.id }, data: { startedAt: new Date(Date.now() - 60_000) } });
    await prisma().mockSession.update({ where: { id: second.id }, data: { startedAt: new Date(Date.now() - 30_000) } });

    expect(await listSessions()).toHaveLength(3);
    expect(await listSessions({ status: MockStatus.IN_PROGRESS }).then((rows) => rows.map((row) => row.id))).toEqual([second.id]);
    expect(await listSessions({ status: MockStatus.COMPLETED }).then((rows) => rows.map((row) => row.id))).toEqual([finished.id]);
    expect(await listSessions({ status: MockStatus.ABANDONED }).then((rows) => rows.map((row) => row.id))).toEqual([first.id]);
    expect((await listSessions()).map((row) => row.id)).toEqual([finished.id, second.id, first.id]);
  });
});
