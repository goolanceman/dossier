import "server-only";

import type { MockSession, Prisma } from "@/generated/prisma/client";
import { MockKind, MockStatus } from "@/generated/prisma/enums";
import type { MockFeedback } from "@/lib/ai/task-contracts";
import { prisma } from "@/lib/prisma";

// Mock interviews (master.md §7.5): turns are kept in the session, and the
// verdict comes only from the caller, which passes a validated MockFeedback
// from the mock_feedback task. Nothing here scores an answer on its own.

/** One question-and-answer exchange, with the verdict once it has one. */
export type SessionTurn = { question: string; answer: string; feedback: MockFeedback | null };

/** A stored session with its JSON columns read back as data. */
export type SessionView = Omit<MockSession, "turns" | "feedback"> & { turns: SessionTurn[]; feedback: MockFeedback | null };

function feedbackOf(value: unknown): MockFeedback | null {
  // Written only from a validated MockFeedback; anything else reads as "not yet evaluated".
  return value !== null && typeof value === "object" ? (value as MockFeedback) : null;
}

function turnOf(value: Prisma.JsonValue): SessionTurn | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Record<string, unknown>;
  return typeof entry.question === "string" && typeof entry.answer === "string"
    ? { question: entry.question, answer: entry.answer, feedback: feedbackOf(entry.feedback) }
    : null;
}

function turnsOf(value: Prisma.JsonValue | null): SessionTurn[] {
  return Array.isArray(value) ? value.flatMap((entry) => turnOf(entry) ?? []) : [];
}

function toView(row: MockSession): SessionView {
  return { ...row, turns: turnsOf(row.turns), feedback: feedbackOf(row.feedback) };
}

/** Opens a session; the interviewer asks one question at a time after this. */
export async function startSession(input: { planId?: string; kind: MockKind }): Promise<SessionView> {
  const row = await prisma.mockSession.create({
    data: { planId: input.planId ?? null, kind: input.kind, turns: [] },
  });
  return toView(row);
}

/** Appends one exchange. A turn starts without feedback; recordFeedback writes it. */
export async function addTurn(sessionId: string, turn: { question: string; answer: string }): Promise<SessionView> {
  const session = await prisma.mockSession.findUniqueOrThrow({ where: { id: sessionId } });
  const turns = [...turnsOf(session.turns), { ...turn, feedback: null }];
  return toView(await prisma.mockSession.update({ where: { id: sessionId }, data: { turns } }));
}

/**
 * Records the interviewer's verdict and completes the session. The score is
 * the plain rounded mean of the five feedback dimensions; nothing here bends
 * it upward. An aborted signal stops the write, so a cancelled AI call leaves
 * the session as it was.
 */
export async function recordFeedback(sessionId: string, feedback: MockFeedback, options: { signal?: AbortSignal } = {}): Promise<SessionView> {
  options.signal?.throwIfAborted();
  const session = await prisma.mockSession.findUniqueOrThrow({ where: { id: sessionId } });
  const turns = turnsOf(session.turns);
  // The verdict lands on the last turn as well, so a turn read alone shows it.
  const evaluated = turns.map((turn, index) => (index === turns.length - 1 ? { ...turn, feedback } : turn));
  const { technicalAccuracy, structure, depth, communication, evidenceUse } = feedback;
  const score = Math.round((technicalAccuracy + structure + depth + communication + evidenceUse) / 5);
  const row = await prisma.mockSession.update({
    where: { id: sessionId },
    data: { turns: evaluated, feedback, score, status: MockStatus.COMPLETED, finishedAt: new Date() },
  });
  return toView(row);
}

export async function abandonSession(id: string): Promise<void> {
  await prisma.mockSession.update({ where: { id }, data: { status: MockStatus.ABANDONED } });
}

export async function getSession(id: string): Promise<SessionView | null> {
  const row = await prisma.mockSession.findUnique({ where: { id } });
  return row ? toView(row) : null;
}

/** The sessions, newest first, optionally one status only. */
export async function listSessions({ status }: { status?: MockStatus } = {}): Promise<SessionView[]> {
  const rows = await prisma.mockSession.findMany({
    where: { ...(status ? { status } : {}) },
    orderBy: { startedAt: "desc" },
  });
  return rows.map(toView);
}
