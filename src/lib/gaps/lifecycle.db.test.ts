import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GapQuestionStatus } from "@/generated/prisma/enums";
import type { GapQuestions } from "@/lib/ai/task-contracts";
import { createAchievement, getAchievement, type AchievementView } from "@/lib/career/achievements";
import { createTestClient, resetDatabase } from "@/test/db";

import { answerQuestion, confirmAnswerAsEvidence, createGapQuestions, listGapQuestions, markUnknown, saveForLater, skipQuestion } from "./lifecycle";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
// The real career module is kept, wrapped, so the confirm tests can either
// stub the creation or run against the real one.
vi.mock("@/lib/career/achievements", async () => {
  const actual = await vi.importActual<typeof import("@/lib/career/achievements")>("@/lib/career/achievements");
  return { createAchievement: vi.fn(actual.createAchievement), getAchievement: vi.fn(actual.getAchievement) };
});
const prisma = () => db.client!;

beforeEach(async () => {
  await resetDatabase(prisma());
  vi.mocked(createAchievement).mockClear();
});
afterAll(() => prisma().$disconnect());

const question = {
  id: "q1",
  question: "What volume did your Kafka systems process?",
  reason: "The JD asks for high-throughput systems",
  relatedRequirement: "High-throughput distributed systems",
  expectedInformation: ["approximate volume"],
  questionType: "METRICS",
  priority: "CRITICAL",
  alreadyKnown: false,
} satisfies GapQuestions["questions"][number];

const generated = (questions: Partial<GapQuestions["questions"][number]>[] = [{}]): GapQuestions => ({
  schema_version: "1.0",
  task: "gap_questions",
  questions: questions.map((overrides, index) => ({ ...question, id: `q${index + 1}`, ...overrides })),
});

describe("createGapQuestions", () => {
  it("persists open questions and drops what the profile already answers", async () => {
    const ids = await createGapQuestions({ generated: generated([{}, { alreadyKnown: true }, { question: "  what volume did your Kafka systems process? " }]), generatedWith: "gap-questions@1" });
    expect(ids).toHaveLength(1);
    const [row] = await listGapQuestions();
    expect(row).toMatchObject({
      question: "What volume did your Kafka systems process?",
      reason: "The JD asks for high-throughput systems",
      relatedRequirement: "High-throughput distributed systems",
      questionType: "METRICS",
      priority: "CRITICAL",
      status: GapQuestionStatus.OPEN,
      generatedWith: "gap-questions@1",
      achievementId: null,
    });
  });

  it("does not ask the same question again while it is still open for the posting", async () => {
    const posting = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "job-1" } });
    const input = { postingId: posting.id, generated: generated(), generatedWith: "gap-questions@1" };
    expect(await createGapQuestions(input)).toHaveLength(1);
    // Same text, different case and spacing: still a duplicate.
    expect(await createGapQuestions(input)).toEqual([]);

    const other = { ...input, postingId: undefined };
    expect(await createGapQuestions(other)).toHaveLength(1);

    // Answered questions may be asked again: they are no longer open.
    const [id] = await listGapQuestions({ postingId: posting.id });
    await answerQuestion(id!.id, "About 2M messages a day.");
    expect(await createGapQuestions(input)).toHaveLength(1);
  });

  it("keeps answers out of the dedupe of a different application", async () => {
    const application = await prisma().application.create({ data: { title: "A" } });
    await createGapQuestions({ applicationId: application.id, generated: generated(), generatedWith: "gap-questions@1" });
    await createGapQuestions({ generated: generated(), generatedWith: "gap-questions@1" });
    expect(await prisma().gapQuestion.count()).toBe(2);
  });
});

describe("the question's lifecycle", () => {
  it("keeps the answer as written and stamps the date", async () => {
    const [id] = await createGapQuestions({ generated: generated(), generatedWith: "gap-questions@1" });
    await answerQuestion(id!, "About 2M messages a day, measured on dashboards.");
    const [row] = await listGapQuestions({ status: GapQuestionStatus.ANSWERED });
    expect(row).toMatchObject({ status: GapQuestionStatus.ANSWERED, answer: "About 2M messages a day, measured on dashboards.", answeredAt: expect.any(Date) });
  });

  it("moves a question along skip, unknown and save for later", async () => {
    const [a, b, c] = await createGapQuestions({ generated: generated([{ question: "One?" }, { question: "Two?" }, { question: "Three?" }]), generatedWith: "gap-questions@1" });
    await skipQuestion(a!);
    await markUnknown(b!);
    await saveForLater(c!);
    expect(await listGapQuestions({ status: GapQuestionStatus.SKIPPED }).then((rows) => rows.map((row) => row.id))).toEqual([a]);
    expect(await listGapQuestions({ status: GapQuestionStatus.UNKNOWN }).then((rows) => rows.map((row) => row.id))).toEqual([b]);
    expect(await listGapQuestions({ status: GapQuestionStatus.SAVED_FOR_LATER }).then((rows) => rows.map((row) => row.id))).toEqual([c]);
  });

  it("lists sharpest first, then oldest first, and filters by scope", async () => {
    const posting = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "job-1" } });
    await createGapQuestions({
      postingId: posting.id,
      generated: generated([
        { question: "Low one?", priority: "LOW" },
        { question: "Critical one?", priority: "CRITICAL" },
        { question: "High one?", priority: "HIGH" },
      ]),
      generatedWith: "gap-questions@1",
    });
    const rows = await listGapQuestions({ postingId: posting.id });
    expect(rows.map((row) => row.question)).toEqual(["Critical one?", "High one?", "Low one?"]);
    // A different posting's questions stay out.
    expect(await listGapQuestions({ postingId: "missing" })).toEqual([]);
  });
});

describe("confirmAnswerAsEvidence", () => {
  const answer = "About 2M messages a day, and I owned the partitioning.";
  const input = { title: "Kafka throughput at scale", description: answer, metrics: ["2M messages/day"], status: "IMPORTED" as const };

  it("creates the achievement from the answer and links it, keeping the answer on the question", async () => {
    const [id] = await createGapQuestions({ generated: generated(), generatedWith: "gap-questions@1" });
    await answerQuestion(id!, answer);
    // A real row stands behind the stub id: the link is a foreign key.
    const stub = await prisma().careerAchievement.create({ data: { title: "Stubbed achievement", technologies: [], metrics: [], tags: [], skills: [], versions: [] } });
    vi.mocked(createAchievement).mockResolvedValueOnce({ id: stub.id } as AchievementView);

    const achievementId = await confirmAnswerAsEvidence(id!, input);
    expect(achievementId).toBe(stub.id);
    expect(vi.mocked(createAchievement)).toHaveBeenCalledWith(expect.objectContaining({ title: "Kafka throughput at scale" }), { origin: `gap-question:${id}` });

    const [row] = await listGapQuestions({ status: GapQuestionStatus.ANSWERED });
    expect(row).toMatchObject({ achievementId: stub.id, answer });
  });

  it("refuses a question with no answer", async () => {
    const [id] = await createGapQuestions({ generated: generated(), generatedWith: "gap-questions@1" });
    await expect(confirmAnswerAsEvidence(id!, input)).rejects.toThrow("Only an answered question can become evidence.");
    expect(vi.mocked(createAchievement)).not.toHaveBeenCalled();
  });

  it("adds a real IMPORTED achievement through the career module, never touching existing facts", async () => {
    const [id] = await createGapQuestions({ generated: generated(), generatedWith: "gap-questions@1" });
    await answerQuestion(id!, answer);

    const achievementId = await confirmAnswerAsEvidence(id!, input);
    const achievement = await getAchievement(achievementId);
    expect(achievement).toMatchObject({ title: "Kafka throughput at scale", status: "IMPORTED", origin: `gap-question:${id}` });
    expect(await prisma().gapQuestion.findUniqueOrThrow({ where: { id: id! } })).toMatchObject({ achievementId, answer });
    // Nothing else in the library was modified.
    expect(await prisma().careerAchievement.count()).toBe(1);
  });
});
