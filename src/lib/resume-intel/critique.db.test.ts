import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResumeCritique } from "@/lib/ai/task-contracts";
import { createTestClient, resetDatabase } from "@/test/db";

import { deleteCritique, findingsByPriority, getCritique, listCritiques, saveCritique } from "./critique";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

const finding = (id: string, severity: ResumeCritique["findings"][number]["severity"], category: ResumeCritique["findings"][number]["category"] = "CONTENT") => ({
  id,
  category,
  severity,
  title: `Finding ${id}`,
  currentProblem: "The summary reads generically.",
  recommendation: "Name the domain and the outcome.",
  expectedImpact: "Stronger first screen.",
  effort: "LIGHT" as const,
  evidenceRequired: ["a metric"],
  relatedJobRequirements: ["Ownership"],
  confidence: "HIGH" as const,
});

const critique = (over: Partial<ResumeCritique> = {}): ResumeCritique => ({
  schema_version: "1.0",
  task: "resume_critique",
  overall: { score: 62, atsReadiness: "GOOD", summary: "Solid core, weak evidence." },
  findings: [finding("f1", "HIGH"), finding("f2", "CRITICAL")],
  keywordCoverage: ["Missing: Kubernetes"],
  formattingIssues: ["Two-column layout"],
  strengths: ["Clear structure"],
  ...over,
});

describe("critique persistence", () => {
  it("saves a critique straight from the contract and reads it back", async () => {
    const id = await saveCritique({ fileName: "resume-v3.pdf", content: "The whole resume text.", critique: critique(), critiquedWith: "resume-critique@1" });
    const row = await getCritique(id);
    expect(row).toMatchObject({
      fileName: "resume-v3.pdf",
      content: "The whole resume text.",
      overall: { score: 62, atsReadiness: "GOOD", summary: "Solid core, weak evidence." },
      findings: critique().findings,
      keywordCoverage: ["Missing: Kubernetes"],
      formattingIssues: ["Two-column layout"],
      targetId: null,
      critiquedWith: "resume-critique@1",
    });
  });

  it("saves a base resume critique with no file name and an optional target", async () => {
    const id = await saveCritique({ content: "Base resume.", critique: critique(), critiquedWith: "resume-critique@1", targetId: "target-1" });
    expect(await getCritique(id)).toMatchObject({ fileName: "", targetId: "target-1" });
  });

  it("lists critiques newest first, optionally for one target", async () => {
    await saveCritique({ content: "First.", critique: critique(), critiquedWith: "resume-critique@1" });
    await saveCritique({ content: "Second.", critique: critique(), critiquedWith: "resume-critique@1", targetId: "target-1" });

    expect((await listCritiques()).map((row) => row.content)).toEqual(["Second.", "First."]);
    expect((await listCritiques({ targetId: "target-1" })).map((row) => row.content)).toEqual(["Second."]);
    expect(await listCritiques({ targetId: "other" })).toEqual([]);
  });

  it("deletes a critique", async () => {
    const id = await saveCritique({ content: "Gone soon.", critique: critique(), critiquedWith: "resume-critique@1" });
    await deleteCritique(id);
    expect(await getCritique(id)).toBeNull();
    expect(await listCritiques()).toEqual([]);
  });
});

describe("findingsByPriority", () => {
  it("sorts findings by severity, then category, leaving the input alone", () => {
    const result = critique({
      findings: [
        finding("low", "LOW", "WRITING"),
        finding("medium", "MEDIUM", "ATS"),
        finding("high", "HIGH", "WRITING"),
        finding("critical-b", "CRITICAL", "RECRUITER"),
        finding("critical-a", "CRITICAL", "ATS"),
      ],
    });
    const sorted = findingsByPriority(result);
    expect(sorted.map(({ id }) => id)).toEqual(["critical-a", "critical-b", "high", "medium", "low"]);
    // The stored critique is untouched.
    expect(result.findings.map(({ id }) => id)).toEqual(["low", "medium", "high", "critical-b", "critical-a"]);
  });

  it("reads findings back from a stored row", async () => {
    const id = await saveCritique({ content: "C", critique: critique({ findings: [finding("low", "LOW"), finding("critical", "CRITICAL", "ATS")] }), critiquedWith: "resume-critique@1" });
    const row = await getCritique(id);
    expect(findingsByPriority({ ...critique(), findings: row!.findings as ResumeCritique["findings"] }).map(({ id }) => id)).toEqual(["critical", "low"]);
  });
});
