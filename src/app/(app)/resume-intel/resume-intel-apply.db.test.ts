import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { applyFindings as applyFindingsTask, careerPlan as careerPlanTask } from "@/lib/ai/tasks";
import { DocumentKind, VersionCause } from "@/generated/prisma/enums";
import type { ResumeCritique } from "@/lib/ai/task-contracts";
import type { Unit } from "@/lib/application-data";
import { createAchievement } from "@/lib/career/achievements";
import { createTarget } from "@/lib/career/targets";
import { saveVersion } from "@/lib/document-versions";
import { getCritique, saveCritique } from "@/lib/resume-intel/critique";
import { createTestClient, resetDatabase } from "@/test/db";

import { addFindingEvidence } from "./actions";
import { applyFindingsJob, careerPlanJob } from "./jobs";

// Applying findings to the master resume, adding a finding's evidence and
// planning career goals (master.md §5.2–5.3, Phase 5): the jobs run against
// the database with the master-document lib and the AI tasks mocked, since
// those are checked in their own tests.

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
vi.mock("@/lib/ai/routing", () => ({ getProviderForTask: vi.fn(async () => db.provider) }));
vi.mock("@/lib/ai/task-options", () => ({ loadTaskOptions: async () => ({ creativity: "FAITHFUL", strict: true, language: null }) }));
// The tasks' answers stand in for the model's, in the shape the contract validates.
vi.mock("@/lib/ai/tasks", () => ({
  resumeCritique: vi.fn(),
  applyFindings: vi.fn(),
  careerPlan: vi.fn(),
}));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile() };
});
// The queue would run the job in the background; here run() is called by hand.
vi.mock("@/lib/jobs/runner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/jobs/runner")>()),
  startJob: vi.fn(async () => "job-1"),
}));
// The master document's lib, mocked whole: these tests check what the jobs do with it.
const master = vi.hoisted(() => ({
  masterUnitsFromProfile: vi.fn<() => Unit[]>(),
  getMasterDocument: vi.fn(),
  saveMasterDocument: vi.fn(),
  validateAppliedUnits: vi.fn<() => { unitId: string; problem: string }[]>(),
}));
vi.mock("@/lib/resume-intel/master", () => master);
// The career module is real except for createAchievement, whose call the action test asserts on.
vi.mock("@/lib/career/achievements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/career/achievements")>()),
  createAchievement: vi.fn(),
}));

const prisma = () => db.client!;
const context = { id: "test-job", step: async () => {}, signal: new AbortController().signal };

const finding = (id: string, severity: ResumeCritique["findings"][number]["severity"] = "HIGH") => ({
  id,
  category: "CONTENT" as const,
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
  findings: [finding("f1", "CRITICAL"), finding("f2", "MEDIUM")],
  keywordCoverage: [],
  formattingIssues: [],
  strengths: [],
};

const RESUME = "Jane Doe\nSenior Product Designer\nExperience: Northwind Logistics, 2015 to now.";

// The master resume's units before anything is applied, as masterUnitsFromProfile builds them.
const BASE_UNITS: Unit[] = [
  { id: "summary", label: "Summary", text: "Designer with 8 years of experience." },
  { id: "experience:e1", label: "Northwind role", text: "Led the design team." },
];

const appliedAnswer = (units: { id: string; label: string; text: string }[]) => ({
  data: {
    schema_version: "1.0",
    task: "apply_findings",
    units,
    changes: [{ findingId: "f1", unitId: "summary", summary: "Named the domain." }],
    unapplied: [{ findingId: "f2", reason: "Needs a number you haven't confirmed." }],
  },
  promptVersion: "apply-findings@1",
});

beforeEach(async () => {
  await resetDatabase(prisma());
  db.provider = { kind: "MOCK", model: "mock" } as never;
  vi.mocked(createAchievement).mockClear();
  master.masterUnitsFromProfile.mockReturnValue(BASE_UNITS);
  master.getMasterDocument.mockResolvedValue(null);
  master.validateAppliedUnits.mockReturnValue([]);
  // The real saveMasterDocument writes the version row and marks the linked
  // critique applied; the mock does the same, so the job's use of it is checked.
  master.saveMasterDocument.mockImplementation(
    async (units: Unit[], opts: { critiqueId?: string } = {}) =>
      prisma().$transaction(async (tx) => {
        const document = await tx.document.create({
          data: { applicationId: null, kind: DocumentKind.RESUME, units, writtenWith: "apply-findings@1" },
        });
        await saveVersion(tx, document.id, units, { cause: VersionCause.REGENERATED, detail: "Applied critique findings" });
        if (opts?.critiqueId) await tx.resumeCritique.update({ where: { id: opts.critiqueId }, data: { appliedDocumentId: document.id } });
        return document;
      }),
  );
  await createTarget({ title: "Senior Backend Engineer", summary: "Owns payments platforms at scale." });
});

afterAll(() => prisma().$disconnect());

describe("applyFindingsJob.run", () => {
  it("saves the master document, marks the critique applied and writes a version row", async () => {
    const critiqueId = await saveCritique({ content: RESUME, critique: answer, critiquedWith: "resume-critique@1" });
    const units = [
      { id: "summary", label: "Summary", text: "Designer with 8 years of payments experience." },
      { id: "experience:e1", label: "Northwind role", text: "Led the design team and shipped the redesign." },
    ];
    vi.mocked(applyFindingsTask).mockResolvedValue(appliedAnswer(units) as never);

    const result = await applyFindingsJob.run({ critiqueId, findingIds: [] }, context);

    expect(result).toMatchObject({ applied: 1, unapplied: 1 });
    // The master document holds the task's units, and the critique points at it.
    const row = await getCritique(critiqueId);
    expect(row?.appliedDocumentId).toBe(result.documentId);
    const document = await prisma().document.findUnique({ where: { id: result.documentId } });
    const saved = document?.units as Unit[];
    expect(saved.map(({ id, text }) => ({ id, text }))).toEqual(units.map(({ id, text }) => ({ id, text })));
    // A version records the apply (E8-10), saved against the returned document.
    const version = await prisma().documentVersion.findFirst({ where: { documentId: result.documentId } });
    expect(version).toMatchObject({ cause: "REGENERATED", detail: "Applied critique findings" });
    // The call carried the guarded units (the guard's own flags are checked in its tests).
    const [savedUnits, options] = vi.mocked(master.saveMasterDocument).mock.calls[0];
    expect((savedUnits as Unit[]).map(({ id, text }) => ({ id, text }))).toEqual(units.map(({ id, text }) => ({ id, text })));
    expect(options).toEqual({ critiqueId });
  });

  it("reverts flagged units that added numbers the input didn't have, and keeps the rest", async () => {
    const critiqueId = await saveCritique({ content: RESUME, critique: answer, critiquedWith: "resume-critique@1" });
    master.validateAppliedUnits.mockReturnValue([
      { unitId: "summary", problem: "states 400" },
      { unitId: "experience:e1", problem: "reads as a claim" },
    ]);
    vi.mocked(applyFindingsTask).mockResolvedValue(
      appliedAnswer([
        // The summary added "400 users": the guard flags it and the number is new, so it reverts.
        { id: "summary", label: "Summary", text: "Designer with 8 years and 400 users." },
        // This one is flagged too, but added no new number: the wording stays.
        { id: "experience:e1", label: "Northwind role", text: "Led the design team for the whole company." },
      ]) as never,
    );

    const result = await applyFindingsJob.run({ critiqueId, findingIds: ["f1", "f2"] }, context);

    const document = await prisma().document.findUnique({ where: { id: result.documentId } });
    const units = document?.units as Unit[];
    expect(units.find(({ id }) => id === "summary")?.text).toBe("Designer with 8 years of experience.");
    expect(units.find(({ id }) => id === "experience:e1")?.text).toBe("Led the design team for the whole company.");
  });

  it("maps the achievements the critique's findings added to the units their changes went into", async () => {
    const critiqueId = await saveCritique({ content: RESUME, critique: answer, critiquedWith: "resume-critique@1" });
    const achievement = await prisma().careerAchievement.create({
      // The JSON columns have no database defaults; empty lists are what the lib's emptyAchievement fills.
      data: {
        title: "Finding f1",
        origin: `resume-critique:${critiqueId}:f1`,
        status: "IMPORTED",
        technologies: [],
        metrics: [],
        tags: [],
        skills: [],
        versions: [],
      },
    });
    vi.mocked(applyFindingsTask).mockResolvedValue(appliedAnswer(BASE_UNITS) as never);

    const result = await applyFindingsJob.run({ critiqueId, findingIds: [] }, context);

    const evidence = await prisma().documentEvidence.findMany({ where: { documentId: result.documentId } });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ achievementId: achievement.id, unitId: "summary" });
  });
});

describe("addFindingEvidence", () => {
  it("creates one IMPORTED achievement with the critique's origin and marks the finding", async () => {
    vi.mocked(createAchievement).mockResolvedValue({ id: "ach-1" } as never);
    const critiqueId = await saveCritique({ content: RESUME, critique: answer, critiquedWith: "resume-critique@1" });

    const result = await addFindingEvidence({ critiqueId, findingId: "f1" });

    expect(result).toMatchObject({ ok: true, data: { achievementId: "ach-1" } });
    expect(createAchievement).toHaveBeenCalledWith(
      { title: "Finding f1", description: "Name the domain and the outcome.", metrics: ["a metric"] },
      { origin: `resume-critique:${critiqueId}:f1` },
    );
    const row = await getCritique(critiqueId);
    const stored = (row?.findings as { id: string; createdEvidenceId?: string }[]).find(({ id }) => id === "f1");
    expect(stored?.createdEvidenceId).toBe("ach-1");
  });

  it("says where the evidence already is instead of creating a duplicate", async () => {
    vi.mocked(createAchievement).mockResolvedValue({ id: "ach-1" } as never);
    const critiqueId = await saveCritique({ content: RESUME, critique: answer, critiquedWith: "resume-critique@1" });
    await addFindingEvidence({ critiqueId, findingId: "f1" });

    const again = await addFindingEvidence({ critiqueId, findingId: "f1" });

    expect(again).toMatchObject({ ok: true, data: { achievementId: "ach-1" } });
    expect(createAchievement).toHaveBeenCalledTimes(1);
  });
});

describe("careerPlanJob.run", () => {
  it("draws the plan from the base resume and stores it for the Career page", async () => {
    vi.mocked(careerPlanTask).mockResolvedValue({
      data: {
        schema_version: "1.0",
        task: "career_plan",
        headline: "Grow into staff design",
        summary: "The resume shows the path.",
        goals: [],
        risks: ["The evidence is thin on scale."],
      },
      promptVersion: "career-plan@1",
    } as never);

    const { planId } = await careerPlanJob.run({ critiqueId: "" }, context);

    const plan = await prisma().careerPlan.findUnique({ where: { id: planId } });
    expect(plan).toMatchObject({ basedOn: "RESUME", headline: "Grow into staff design", planWith: "career-plan@1", critiqueId: null });
    // The task saw the base resume's text, the profile, the targets and the achievements.
    const input = vi.mocked(careerPlanTask).mock.calls[0][1] as { resume: string; targets: { id: string; title: string; summary: string }[] };
    expect(input.resume).toContain("Jane Doe");
    const target = (await prisma().careerTarget.findFirst())!;
    expect(input.targets).toEqual([{ id: target.id, title: "Senior Backend Engineer", summary: "Owns payments platforms at scale." }]);
  });

  it("builds on the critiqued resume's own text when one is given", async () => {
    vi.mocked(careerPlanTask).mockResolvedValue({
      data: { schema_version: "1.0", task: "career_plan", headline: "", summary: "", goals: [], risks: [] },
      promptVersion: "career-plan@1",
    } as never);
    const critiqueId = await saveCritique({ content: RESUME, critique: answer, critiquedWith: "resume-critique@1" });

    const { planId } = await careerPlanJob.run({ critiqueId }, context);

    const plan = await prisma().careerPlan.findUnique({ where: { id: planId } });
    expect(plan?.critiqueId).toBe(critiqueId);
    const input = vi.mocked(careerPlanTask).mock.calls[0][1] as { resume: string };
    expect(input.resume).toBe(RESUME);
  });
});
