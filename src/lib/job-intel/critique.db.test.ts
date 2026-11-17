import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { critiqueSchema, getUserOverride, saveCritique, saveUserOverride, type JobCritique } from "./critique";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

const critique: JobCritique = {
  attractive: ["Greenfield platform work", "Strong engineering culture"],
  suitable: ["Five years of production Kubernetes"],
  lacking: ["Rust"],
  hiddenRequirements: ["On-call for the payments stack"],
  interviewDifficulty: "A system design round plus a deep dive into distributed transactions.",
  seniorityMismatch: "The role runs a team of four; the profile shows no lead experience yet.",
  concerns: ["The team is mid-migration to a new stack"],
  progression: "A clear path to Staff on the platform team.",
  salaryCompetitiveness: "The stated range sits at the top of the Berlin market for this title.",
  recommendation: "APPLY_AFTER_PREPARATION",
  reasoning: "Prepare Rust and a team-lead story first.",
};

let postingId: string;

beforeEach(async () => {
  await resetDatabase(prisma());
  const posting = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "job-1", title: "Backend Engineer", company: "Northwind", place: "Berlin" } });
  postingId = posting.id;
});
afterAll(() => prisma().$disconnect());

describe("critiqueSchema", () => {
  it("accepts the critique the task contract describes", () => {
    expect(critiqueSchema.safeParse(critique).success).toBe(true);
  });

  it("refuses unknown keys and overlong strings", () => {
    expect(critiqueSchema.safeParse({ ...critique, atsScore: 90 }).success).toBe(false);
    expect(critiqueSchema.safeParse({ ...critique, reasoning: "x".repeat(2_001) }).success).toBe(false);
    expect(critiqueSchema.safeParse({ ...critique, recommendation: "MAYBE" }).success).toBe(false);
  });
});

describe("saveCritique", () => {
  it("starts a PENDING assessment row when there is none yet", async () => {
    await saveCritique(postingId, critique);
    const row = await prisma().jobAssessment.findUniqueOrThrow({ where: { postingId } });
    expect(row.decision).toBe("PENDING");
    expect(row.critique).toEqual(critique);
  });

  it("merges into an existing assessment row without touching its decision", async () => {
    await prisma().jobAssessment.create({ data: { postingId, stage: "ASSESSED", decision: "STRONG_MATCH", reasons: [], assessedWith: "assess-job@1" } });
    await saveCritique(postingId, critique);
    const row = await prisma().jobAssessment.findUniqueOrThrow({ where: { postingId } });
    expect(row.decision).toBe("STRONG_MATCH");
    expect(row.assessedWith).toBe("assess-job@1");
    expect(row.critique).toEqual(critique);
    expect(await prisma().jobAssessment.count()).toBe(1);
  });

  it("replaces an earlier critique on the same row", async () => {
    await saveCritique(postingId, critique);
    await saveCritique(postingId, { ...critique, recommendation: "SAVE_FOR_LATER" });
    const row = await prisma().jobAssessment.findUniqueOrThrow({ where: { postingId } });
    expect((row.critique as JobCritique).recommendation).toBe("SAVE_FOR_LATER");
  });
});

describe("user overrides (master.md §3.4)", () => {
  it("reads no override when there is no row", async () => {
    expect(await getUserOverride(postingId)).toBeNull();
  });

  it("records the user's reasoning, with or without an assessment row", async () => {
    await saveUserOverride(postingId, "The AI undervalues my Rust side projects.");
    const row = await prisma().jobAssessment.findUniqueOrThrow({ where: { postingId } });
    expect(row.userOverride).toBe("The AI undervalues my Rust side projects.");
    expect(row.decision).toBe("PENDING");
    expect(await getUserOverride(postingId)).toBe("The AI undervalues my Rust side projects.");
  });

  it("replaces the reasoning when the user overrides again", async () => {
    await saveUserOverride(postingId, "First thought.");
    await saveUserOverride(postingId, "On reflection: the AI undervalues my Rust side projects.");
    expect(await getUserOverride(postingId)).toBe("On reflection: the AI undervalues my Rust side projects.");
  });

  it("needs a reason before it records anything", async () => {
    await expect(saveUserOverride(postingId, "   ")).rejects.toThrow("Write why you disagree");
    expect(await prisma().jobAssessment.count()).toBe(0);
  });
});
