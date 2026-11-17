import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeDocStatus } from "@/generated/prisma/enums";
import type { DocFindings } from "@/lib/ai/task-contracts";
import { createTestClient, resetDatabase } from "@/test/db";

import { getAchievement } from "./achievements";
import { createDoc, deleteDoc, getDoc, listDocs, markReviewed, toKnowledgeText, updateDoc, type DocKind } from "./knowledge";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

const findings: DocFindings = {
  schema_version: "1.0",
  task: "knowledge_doc_review",
  findings: [{ id: "f1", kind: "MISSING_METRIC", note: "Says faster, never says how much.", quote: "made everything faster", duplicateOf: "" }],
  achievements: [
    { title: "Ledgerly migration", description: "Moved billing to an event-driven pipeline", company: "Northwind", technologies: ["Kafka"], metrics: ["p99 latency -40%"] },
  ],
};

const doc = (name: string, kind: DocKind) => ({ name, kind, content: `Text of ${name}.`, sourceUrl: "https://example.com/cv" });

describe("knowledge docs", () => {
  it("creates with defaults and lists newest first, optionally by status", async () => {
    await createDoc(doc("Resume 2026", "RESUME"));
    const second = await createDoc({ name: "GitHub profile" });
    expect(second).toMatchObject({ kind: "OTHER", content: "", status: "NEW", findings: null, achievementIds: [] });

    expect((await listDocs()).map((d) => d.name)).toEqual(["GitHub profile", "Resume 2026"]);
    expect((await listDocs({ status: KnowledgeDocStatus.NEW })).map((d) => d.name)).toEqual(["GitHub profile", "Resume 2026"]);
    expect(await listDocs({ status: KnowledgeDocStatus.REVIEWED })).toEqual([]);
  });

  it("markReviewed stores findings, the prompt version, and drafted achievements as IMPORTED", async () => {
    const created = await createDoc(doc("Resume 2026", "RESUME"));
    await markReviewed(created.id, findings, "knowledge-doc-review@1");

    const stored = (await getDoc(created.id))!;
    expect(stored).toMatchObject({ status: "REVIEWED", reviewedWith: "knowledge-doc-review@1" });
    expect(stored.findings?.findings[0]).toMatchObject({ kind: "MISSING_METRIC", duplicateOf: "" });
    expect(stored.achievementIds).toHaveLength(1);

    // The draft landed as an achievement the user can verify, traced back to the doc.
    const achievement = await getAchievement(stored.achievementIds[0]!);
    expect(achievement).toMatchObject({
      title: "Ledgerly migration",
      company: "Northwind",
      status: "IMPORTED",
      origin: `doc:${created.id}`,
      metrics: ["p99 latency -40%"],
    });
    expect(await prisma().careerAchievement.count()).toBe(1);
  });

  it("reads a findings column that does not parse as null", async () => {
    const created = await createDoc(doc("Resume 2026", "RESUME"));
    await prisma().knowledgeDoc.update({ where: { id: created.id }, data: { findings: { not: "the contract" } } });
    expect((await getDoc(created.id))?.findings).toBeNull();
  });

  it("updates only the given fields, and deletes", async () => {
    const created = await createDoc(doc("Resume 2026", "RESUME"));
    const updated = await updateDoc(created.id, { status: KnowledgeDocStatus.ARCHIVED, name: "Resume 2026 (old)" });
    expect(updated).toMatchObject({ name: "Resume 2026 (old)", kind: "RESUME", status: "ARCHIVED", content: "Text of Resume 2026." });

    await deleteDoc(created.id);
    expect(await getDoc(created.id)).toBeNull();
  });

  it("toKnowledgeText frames each doc with its name and kind", async () => {
    const resume = await createDoc(doc("Resume 2026", "RESUME"));
    const notes = await createDoc({ name: "Notes", kind: "NOTES", content: "Ask Marta about the reorg." });
    const text = toKnowledgeText([notes, resume]);
    expect(text).toBe("--- Notes (notes) ---\nAsk Marta about the reorg.\n\n--- Resume 2026 (resume) ---\nText of Resume 2026.");
  });
});
