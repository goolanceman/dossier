import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getJob } from "@/lib/jobs/runner";
import { createTestClient, resetDatabase } from "@/test/db";

import { MockProvider } from "@/lib/ai/providers/mock";

import {
  moveAchievements,
  moveTargets,
  removeAchievement,
  removeDoc,
  removeTarget,
  reviewDoc,
  saveAchievement,
  saveDoc,
  saveTarget,
  setAchievementStatus,
  setPrimaryTarget,
  verifyAchievement,
} from "./actions";

// The career actions run against the test database, signed in. The review
// job's AI is a mock that answers in the docFindings schema.

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
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "x".repeat(32) } }));
vi.mock("@/lib/ai/routing", async () => ({
  getProviderForTask: async () =>
    new MockProvider({
      reply: () => ({
        schema_version: "1.0",
        task: "knowledge_doc_review",
        findings: [
          { id: "D1", kind: "MISSING_METRIC", note: "No number for how far it reached.", quote: "rolled the payments service out to everyone", duplicateOf: "" },
        ],
        achievements: [
          { title: "Company-wide payments rollout", description: "Rolled the payments service out to everyone.", technologies: ["Kafka"], company: "Fieldnote", metrics: [] },
        ],
      }),
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

describe("achievement actions (master.md §1.2)", () => {
  it("creates achievements as Imported (unverified), last in the list, with the origin saying the user typed them", async () => {
    const first = await saveAchievement({ title: "Cut checkout p99 by 40%", technologies: ["Postgres"], metrics: ["p99 latency 40% lower"] });
    expect(first).toMatchObject({ ok: true, data: { status: "IMPORTED", origin: "user", sort: 0 } });
    const second = await saveAchievement({ title: "Led the migration" });
    expect(second).toMatchObject({ ok: true, data: { sort: 1 } });
  });

  it("marks verified and sets the other statuses, but keeps them on a plain save", async () => {
    const created = await saveAchievement({ title: "Cut checkout p99 by 40%" });
    if (!created.ok) throw new Error(created.error);
    const id = created.data.id;

    expect(await verifyAchievement({ id })).toMatchObject({ ok: true, data: { status: "VERIFIED" } });
    // A later save of the form doesn't undo the status the user set.
    await saveAchievement({ id, title: "Cut checkout p99 by 45%" });
    expect(await prisma().careerAchievement.findUniqueOrThrow({ where: { id } })).toMatchObject({ title: "Cut checkout p99 by 45%", status: "VERIFIED" });

    expect(await setAchievementStatus({ id, status: "NEEDS_CLARIFICATION" })).toMatchObject({ ok: true, data: { status: "NEEDS_CLARIFICATION" } });
    expect(await setAchievementStatus({ id, status: "REJECTED" })).toMatchObject({ ok: true, data: { status: "REJECTED" } });
  });

  it("reorders the list, and removes for good", async () => {
    const one = await saveAchievement({ title: "One" });
    const two = await saveAchievement({ title: "Two" });
    if (!one.ok || !two.ok) throw new Error("not created");
    const ids = [one.data.id, two.data.id];
    expect(await moveAchievements({ ids: ids.toReversed() })).toEqual({ ok: true, data: null });
    expect(await prisma().careerAchievement.findMany({ orderBy: { sort: "asc" }, select: { title: true } })).toEqual([{ title: "Two" }, { title: "One" }]);

    await removeAchievement({ id: ids[0] });
    expect(await prisma().careerAchievement.count()).toBe(1);
  });
});

describe("target actions (master.md §1.1)", () => {
  it("makes the first target primary by itself, and hands primary over on request", async () => {
    const first = await saveTarget({
      title: "Staff Backend Engineer", summary: "", seniority: "Staff", salaryMin: 90_000, currency: "EUR",
      remoteCountries: ["Germany"], priorities: ["Remote first"], keywords: ["kubernetes"],
    });
    if (!first.ok) throw new Error(first.error);
    expect(first.data).toMatchObject({ primary: true, preferences: { seniority: "Staff", salaryMin: 90_000, currency: "EUR", remoteCountries: ["Germany"], priorities: ["Remote first"], keywords: ["kubernetes"] } });

    const second = await saveTarget({ title: "Platform Engineer", summary: "", seniority: "", salaryMin: null, currency: "EUR", remoteCountries: [], priorities: [], keywords: [] });
    if (!second.ok) throw new Error(second.error);
    expect(second.data).toMatchObject({ primary: false, preferences: { salaryMin: null, currency: "EUR" } });

    expect(await setPrimaryTarget({ id: second.data.id })).toMatchObject({ ok: true, data: { primary: true } });
    expect(await prisma().careerTarget.findUniqueOrThrow({ where: { id: first.data.id } })).toMatchObject({ primary: false });
  });

  it("reorders, and a deleted primary target hands primary to the first one left", async () => {
    const one = await saveTarget({ title: "One", summary: "", seniority: "", salaryMin: null, currency: "EUR", remoteCountries: [], priorities: [], keywords: [] });
    const two = await saveTarget({ title: "Two", summary: "", seniority: "", salaryMin: null, currency: "EUR", remoteCountries: [], priorities: [], keywords: [] });
    if (!one.ok || !two.ok) throw new Error("not created");

    expect(await moveTargets({ ids: [two.data.id, one.data.id] })).toEqual({ ok: true, data: null });
    expect(await prisma().careerTarget.findMany({ orderBy: { sort: "asc" }, select: { title: true } })).toEqual([{ title: "Two" }, { title: "One" }]);

    await removeTarget({ id: one.data.id });
    expect(await prisma().careerTarget.findUniqueOrThrow({ where: { id: two.data.id } })).toMatchObject({ primary: true });
  });});

describe("knowledge-base actions (master.md §1.3)", () => {
  it("adds a document from pasted text, and removes it", async () => {
    const doc = await saveDoc({ name: "CV 2026", kind: "RESUME", sourceUrl: "", content: "I led the payments team at Fieldnote." });
    if (!doc.ok) throw new Error(doc.error);
    expect(doc.data).toMatchObject({ status: "NEW", kind: "RESUME" });
    await removeDoc({ id: doc.data.id });
    expect(await prisma().knowledgeDoc.count()).toBe(0);
  });
  it("refuses to review a document without text", async () => {
    const doc = await saveDoc({ name: "Empty", kind: "OTHER", sourceUrl: "", content: "   " });
    if (!doc.ok) throw new Error(doc.error);
    await expect(reviewDoc({ id: doc.data.id })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/no text to review/) });
  });

  it("reviews a document in the background: findings stored, drafts added as Imported (unverified)", async () => {
    const doc = await saveDoc({
      name: "CV 2026",
      kind: "RESUME",
      sourceUrl: "",
      content: "At Fieldnote I rolled the payments service out to everyone.",
    });
    if (!doc.ok) throw new Error(doc.error);

    const started = await reviewDoc({ id: doc.data.id });
    if (!started.ok) throw new Error(started.error);
    const job = await awaitJob(started.data.jobId);
    expect(job?.status).toBe("DONE");
    expect(job?.result).toEqual({ findings: 1, achievements: 1 });

    const reviewed = await prisma().knowledgeDoc.findUniqueOrThrow({ where: { id: doc.data.id } });
    expect(reviewed.status).toBe("REVIEWED");
    expect(reviewed.reviewedWith).toBe("doc-findings@1");
    const achievementIds = reviewed.achievementIds as string[];
    expect(achievementIds).toHaveLength(1);

    // The draft is in the library, traced back to the document, never verified.
    const draft = await prisma().careerAchievement.findUniqueOrThrow({ where: { id: achievementIds[0] } });
    expect(draft).toMatchObject({ title: "Company-wide payments rollout", status: "IMPORTED", origin: `doc:${doc.data.id}` });
  });
});
