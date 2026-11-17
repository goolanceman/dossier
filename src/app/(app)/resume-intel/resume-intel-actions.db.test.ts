import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResumeCritique } from "@/lib/ai/task-contracts";
import { isAiConfigured } from "@/lib/ai/config";
import { MockProvider } from "@/lib/ai/providers/mock";
import { createTarget, listTargets } from "@/lib/career/targets";
import { findingsByPriority, getCritique, listCritiques, saveCritique } from "@/lib/resume-intel/critique";
import { createTestClient, resetDatabase } from "@/test/db";

import { deleteCritique, openCritique, runCritique } from "./actions";
import { critiqueResumeJob } from "./jobs";

// The critique flow against the database (master.md §5.1–5.2): the action
// starts the job, the job runs the critique task against a mock provider and
// stores the answer, and the actions open and delete what was stored.

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined, provider: undefined as unknown }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ persistent: false, issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: vi.fn(async () => true) }));
vi.mock("@/lib/ai/routing", () => ({ getProviderForTask: vi.fn(async () => db.provider) }));
vi.mock("@/lib/ai/task-options", () => ({ loadTaskOptions: async () => ({ creativity: "FAITHFUL", strict: true, language: null }) }));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile() };
});
// The queue would run the job in the background; here run() is called by hand.
vi.mock("@/lib/jobs/runner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/jobs/runner")>()),
  startJob: vi.fn(async () => "job-1"),
}));

const prisma = () => db.client!;
const context = { id: "test-job", step: async () => {}, signal: new AbortController().signal };

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

const answer: ResumeCritique = {
  schema_version: "1.0",
  task: "resume_critique",
  overall: { score: 62, atsReadiness: "GOOD", summary: "Solid core, weak evidence." },
  findings: [finding("f-low", "LOW", "WRITING"), finding("f-critical", "CRITICAL", "ATS"), finding("f-medium", "MEDIUM")],
  keywordCoverage: ["Missing: Kubernetes"],
  formattingIssues: ["Two-column layout"],
  strengths: ["Clear structure"],
};

const RESUME = "Jane Doe\nSenior Product Designer\nExperience: Northwind Logistics, 2015 to now.";

beforeEach(async () => {
  await resetDatabase(prisma());
  db.provider = new MockProvider({ reply: () => answer });
  await createTarget({ title: "Senior Backend Engineer", summary: "Owns payments platforms at scale." });
});

afterAll(() => prisma().$disconnect());

describe("runCritique", () => {
  it("starts a critique job for pasted text", async () => {
    const target = (await listTargets())[0]!;
    const result = await runCritique({ content: RESUME, targetId: target.id });
    expect(result).toMatchObject({ ok: true, data: { jobId: "job-1" } });
  });

  it("refuses to run without an AI provider", async () => {
    vi.mocked(isAiConfigured).mockResolvedValue(false);
    const result = await runCritique({ content: RESUME });
    expect(result).toMatchObject({ ok: false, error: "Choose an AI provider in Settings first: it's what critiques the resume." });
  });

  it("rejects blank text with a field error", async () => {
    const result = await runCritique({ content: "   " });
    expect(result).toMatchObject({ ok: false, fieldErrors: { content: ["Paste your resume's text first."] } });
  });
});

describe("critiqueResumeJob.run", () => {
  it("critiques against the profile and the chosen target, then stores the answer verbatim", async () => {
    const target = (await listTargets())[0]!;
    const { critiqueId } = await critiqueResumeJob.run({ content: RESUME, fileName: "cv.pdf", targetId: target.id }, context);

    const row = await getCritique(critiqueId);
    expect(row).toMatchObject({
      fileName: "cv.pdf",
      content: RESUME,
      critiquedWith: "resume-critique@1",
      overall: { score: 62, atsReadiness: "GOOD", summary: "Solid core, weak evidence." },
    });
    expect(row?.findings).toEqual(answer.findings);
    expect(row?.targetId).toBe(target.id);

    // The task saw the profile, the resume, and the target's title and summary.
    const prompt = (db.provider as MockProvider).calls[0].messages[0].content;
    expect(prompt).toContain(RESUME);
    expect(prompt).toContain("Senior Backend Engineer");
    expect(prompt).toContain("Owns payments platforms at scale.");
  });

  it("falls back to a general critique when the target is gone", async () => {
    await critiqueResumeJob.run({ content: RESUME, fileName: "", targetId: "gone" }, context);
    expect(await listCritiques()).toMatchObject([{ fileName: "", targetId: null }]);
  });
});

describe("openCritique", () => {
  it("returns the stored critique with its findings in priority order", async () => {
    // Stored out of order, as the model may answer.
    const id = await saveCritique({
      fileName: "cv.pdf",
      content: RESUME,
      critique: answer,
      critiquedWith: "resume-critique@1",
      targetId: "t1",
    });

    const result = await openCritique({ id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.findings.map((finding) => finding.id)).toEqual(findingsByPriority(answer).map((finding) => finding.id));
    expect(result.data.findings[0]?.severity).toBe("CRITICAL");
    expect(typeof result.data.date).toBe("string");
  });

  it("says so when a critique is gone", async () => {
    const result = await openCritique({ id: "nope" });
    expect(result).toMatchObject({ ok: false, error: "That critique isn't there any more. It may have been deleted." });
  });
});

describe("deleteCritique", () => {
  it("deletes a stored critique", async () => {
    const id = await saveCritique({ content: RESUME, critique: answer, critiquedWith: "resume-critique@1" });
    const result = await deleteCritique({ id });
    expect(result.ok).toBe(true);
    expect(await listCritiques()).toEqual([]);
  });
});
