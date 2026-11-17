import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApplyFindings, ResumeCritique } from "@/lib/ai/task-contracts";
import { MockProvider } from "@/lib/ai/providers/mock";
import { saveCritique } from "@/lib/resume-intel/critique";
import { createTestClient, resetDatabase } from "@/test/db";

import { startApplyingFindings, startCritiquingResume } from "./actions";
import { applyApplicationFindingsJob, critiqueApplicationResumeJob } from "./resume-quality-jobs";

// The application's resume quality loop against the database (master.md §5):
// the critique job reads the tailored resume as text and stores the answer
// through saveCritique, and the apply job writes the checked findings back
// into the document the way the refine flow does, keeping the numbers check
// (§5.3): a unit that states numbers no achievement backs reverts.

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
vi.mock("@/lib/ai/config", () => ({ isAiConfigured: async () => true }));
// The calendar's side is tested in src/lib/google; here it's off unless a test says otherwise.
vi.mock("@/lib/google/availability", () => ({ syncInterviewToCalendar: vi.fn(async () => ({ inCalendar: false, eventLink: null })) }));
vi.mock("@/lib/ai/routing", () => ({ getProviderForTask: vi.fn(async () => db.provider) }));
vi.mock("@/lib/ai/task-options", () => ({ loadTaskOptions: async () => ({ creativity: "FAITHFUL", strict: true, language: null }) }));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile() };
});
// The tasks answer from code: apply_findings hasn't landed in src/lib/ai/tasks,
// and both are mocked so the jobs' own writing is what's under test.
const tasks = vi.hoisted(() => ({
  critique: { data: null as ResumeCritique | null, promptVersion: "resume-critique@1" },
  apply: { data: null as ApplyFindings | null, promptVersion: "apply-findings@1" },
}));
vi.mock("@/lib/ai/tasks", () => ({
  resumeCritique: vi.fn(async () => tasks.critique),
  applyFindings: vi.fn(async () => tasks.apply),
}));
// The queue would run the job in the background; here run() is called by hand.
vi.mock("@/lib/jobs/runner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/jobs/runner")>()),
  startJob: vi.fn(async (definition: { type: string }, input: object, options: { key?: string; applicationId?: string }) => {
    const { prisma } = await import("@/lib/prisma");
    return (await prisma.job.create({ data: { type: definition.type, input, key: options.key, applicationId: options.applicationId } })).id;
  }),
}));

const prisma = () => db.client!;
const context = { id: "test-job", step: async () => {}, signal: new AbortController().signal };

const units = [
  { id: "summary", label: "Summary", text: "Calm tools for complex work." },
  { id: "experience:e1", label: "Northwind role", text: "Led the portal\nCut costs by 30%" },
];

const finding = (id: string, severity: ResumeCritique["findings"][number]["severity"]): ResumeCritique["findings"][number] => ({
  id,
  category: "CONTENT",
  severity,
  title: `Finding ${id}`,
  currentProblem: "The summary reads generically.",
  recommendation: "Name the domain and the outcome.",
  expectedImpact: "Stronger first screen.",
  effort: "LIGHT",
  evidenceRequired: ["a metric"],
  relatedJobRequirements: [],
  confidence: "HIGH",
});

const critiqueAnswer: ResumeCritique = {
  schema_version: "1.0",
  task: "resume_critique",
  overall: { score: 58, atsReadiness: "GOOD", summary: "Solid core, weak evidence." },
  findings: [finding("f-low", "LOW"), finding("f-critical", "CRITICAL"), finding("f-high", "HIGH")],
  keywordCoverage: ["design system"],
  formattingIssues: [],
  strengths: [],
};

beforeEach(async () => {
  tasks.critique.data = null;
  tasks.apply.data = null;
  vi.clearAllMocks();
  await resetDatabase(prisma());
  db.provider = new MockProvider({ reply: () => "OK" });
  await prisma().application.create({
    data: {
      id: "app-1",
      title: "Designer at Ledgerly",
      company: "Ledgerly",
      role: "Senior Product Designer",
      postingText: "We need a designer who has led a design system.",
      documents: { create: [{ kind: "RESUME", units, writtenWith: "tailor-resume@1" }] },
    },
  });
  await prisma().careerAchievement.create({
    data: { id: "a1", title: "Ledgerly portal rewrite", status: "VERIFIED", technologies: [], metrics: [], tags: [], versions: [], skills: [] },
  });
  await prisma().documentEvidence.create({
    data: { documentId: await documentId(), achievementId: "a1", unitId: "experience:e1" },
  });
});

const documentId = async () =>
  (await prisma().document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: "app-1", kind: "RESUME" } } })).id;

/** A stored critique of the tailored resume, saved under the company's name as the critique job does. */
const critiqueId = async () =>
  saveCritique({ fileName: "Ledgerly tailored resume", content: "text", critique: critiqueAnswer, critiquedWith: "resume-critique@1" });

const documentRow = async () =>
  await prisma().document.findUniqueOrThrow({ where: { applicationId_kind: { applicationId: "app-1", kind: "RESUME" } } });

afterAll(() => prisma().$disconnect());

describe("critiqueApplicationResumeJob", () => {
  it("critiques the tailored resume's text and stores it under the company's name", async () => {
    tasks.critique.data = critiqueAnswer;
    const { critiqueId } = await critiqueApplicationResumeJob.run({ applicationId: "app-1" }, context);

    const row = await prisma().resumeCritique.findUniqueOrThrow({ where: { id: critiqueId } });
    expect(row).toMatchObject({
      fileName: "Ledgerly tailored resume",
      critiquedWith: "resume-critique@1",
      targetId: null,
      overall: { score: 58, atsReadiness: "GOOD", summary: "Solid core, weak evidence." },
    });
    // The text the findings are checked against is the resume as it reads now.
    expect(row.content).toContain("Calm tools for complex work.");
    expect(row.content).toContain("Cut costs by 30%");
    expect(row.findings).toEqual(critiqueAnswer.findings);
  });

  it("hands the task the application's role, company and posting beside the profile", async () => {
    tasks.critique.data = critiqueAnswer;
    await critiqueApplicationResumeJob.run({ applicationId: "app-1" }, context);

    const { resumeCritique } = await import("@/lib/ai/tasks");
    expect(resumeCritique).toHaveBeenCalledTimes(1);
    const [, input] = vi.mocked(resumeCritique).mock.calls[0]!;
    expect(input).toMatchObject({
      title: "Senior Product Designer",
      company: "Ledgerly",
      posting: "We need a designer who has led a design system.",
    });
    expect(input.profile.basics.name).toBe("Jane Doe");
  });

  it("says so when the application has no tailored resume", async () => {
    await prisma().application.create({ data: { id: "app-2", title: "Bare" } });
    await expect(critiqueApplicationResumeJob.run({ applicationId: "app-2" }, context)).rejects.toThrow("no tailored resume to critique");
  });
});

describe("applyApplicationFindingsJob", () => {
  const appliedAnswer = (summary: string): ApplyFindings => ({
    schema_version: "1.0",
    task: "apply_findings",
    units: [
      // States "10 years", which no achievement backs, so it must revert.
      { id: "summary", label: "Summary", text: summary },
      { id: "experience:e1", label: "Northwind role", text: "Led the portal\nShipped the portal rewrite on time" },
    ],
    changes: [
      { findingId: "f-critical", unitId: "summary", summary: "Added the years of practice." },
      { findingId: "f-high", unitId: "experience:e1", summary: "Led with the outcome." },
    ],
    unapplied: [{ findingId: "f-low", reason: "Needs a number your achievements don't have." }],
  });

  it("writes the applied units with a version, the evidence map and the critique's applied document", async () => {
    tasks.apply.data = appliedAnswer("Calm tools for complex work. 10 years of practice.");
    const id = await critiqueId();

    const result = await applyApplicationFindingsJob.run({ applicationId: "app-1", critiqueId: id, findingIds: ["f-critical", "f-high", "f-low"] }, context);

    // The summary reverted to its input text; the evidenced role's new text stayed.
    const row = await documentRow();
    expect(row.units).toEqual([
      { id: "summary", label: "Summary", text: "Calm tools for complex work." },
      { id: "experience:e1", label: "Northwind role", text: "Led the portal\nShipped the portal rewrite on time" },
    ]);
    expect(row.writtenWith).toBe("tailor-resume@1");

    // The unapplied findings surface in the result: the task's own, and the reverted one.
    expect(result.applied).toEqual([{ findingId: "f-high", unitId: "experience:e1", summary: "Led with the outcome." }]);
    expect(result.unapplied).toEqual([
      { findingId: "f-low", reason: "Needs a number your achievements don't have." },
      { findingId: "f-critical", reason: "Applying it would have stated numbers your achievements don't back, so the part was left as it was." },
    ]);

    // The document's history gains the entry the Resume tab's History can bring back.
    const version = await prisma().documentVersion.findFirstOrThrow({ where: { documentId: row.id } });
    expect(version).toMatchObject({ cause: "REGENERATED", detail: "Applied 1 finding from the critique" });

    // The evidence map keeps backing the role it backed, and the critique points at the document.
    expect(await prisma().documentEvidence.findMany({ where: { documentId: row.id } })).toMatchObject([{ achievementId: "a1", unitId: "experience:e1" }]);
    expect(await prisma().resumeCritique.findUniqueOrThrow({ where: { id } })).toMatchObject({ appliedDocumentId: row.id });
  });

  it("applies only the findings the page sent", async () => {
    tasks.apply.data = appliedAnswer("Calm tools for complex work. 10 years of practice.");
    const id = await critiqueId();

    await applyApplicationFindingsJob.run({ applicationId: "app-1", critiqueId: id, findingIds: ["f-high"] }, context);

    const [, input] = vi.mocked((await import("@/lib/ai/tasks")).applyFindings).mock.calls[0]!;
    expect(input.units.map((unit) => unit.id)).toEqual(["summary", "experience:e1"]);
    expect(input.findings.map((finding) => finding.id)).toEqual(["f-high"]);
    expect(input.profile.basics.name).toBe("Jane Doe");
  });

  it("leaves a resume with nothing applied as it is, and says why", async () => {
    tasks.apply.data = {
      schema_version: "1.0",
      task: "apply_findings",
      units: [{ id: "summary", label: "Summary", text: "Calm tools for complex work. 10 years of practice." }],
      changes: [{ findingId: "f-critical", unitId: "summary", summary: "Added the years of practice." }],
      unapplied: [],
    };
    const id = await critiqueId();

    const result = await applyApplicationFindingsJob.run({ applicationId: "app-1", critiqueId: id }, context);

    // Nothing applied: no units changed, so no version row either.
    expect((await documentRow()).units).toEqual(units);
    expect(await prisma().documentVersion.count()).toBe(0);
    expect(result.applied).toEqual([]);
    expect(result.unapplied).toEqual([{ findingId: "f-critical", reason: "Applying it would have stated numbers your achievements don't back, so the part was left as it was." }]);
    expect(await prisma().resumeCritique.findUniqueOrThrow({ where: { id } })).toMatchObject({ appliedDocumentId: null });
  });

  it("says so when the critique is gone", async () => {
    await expect(applyApplicationFindingsJob.run({ applicationId: "app-1", critiqueId: "gone" }, context)).rejects.toThrow("That critique isn't there any more");
  });

  it("says so when none of the sent findings is in the critique", async () => {
    const id = await critiqueId();
    await expect(applyApplicationFindingsJob.run({ applicationId: "app-1", critiqueId: id, findingIds: ["nope"] }, context)).rejects.toThrow("Tick at least one finding to apply.");
  });
});

describe("startCritiquingResume and startApplyingFindings", () => {
  it("queue the jobs for the application, named so a reload finds them", async () => {
    await expect(startCritiquingResume({ id: "app-1" })).resolves.toMatchObject({ ok: true, data: expect.any(String) });
    expect(await prisma().job.findFirstOrThrow({ where: { type: "critique-application-resume" } })).toMatchObject({
      key: "critique-application-resume:app-1",
      applicationId: "app-1",
    });

    const id = await critiqueId();
    await expect(startApplyingFindings({ id: "app-1", critiqueId: id, findingIds: ["f-high"] })).resolves.toMatchObject({ ok: true, data: expect.any(String) });
    expect(await prisma().job.findFirstOrThrow({ where: { type: "apply-application-findings" } })).toMatchObject({ key: "apply-application-findings:app-1" });
  });

  it("refuse to run without a tailored resume", async () => {
    await prisma().application.create({ data: { id: "app-2", title: "Bare" } });
    await expect(startCritiquingResume({ id: "app-2" })).resolves.toMatchObject({ ok: false, error: "Write the tailored resume first." });
    await expect(startApplyingFindings({ id: "app-2", critiqueId: "c1", findingIds: ["f1"] })).resolves.toMatchObject({ ok: false, error: "Write the tailored resume first." });
  });
});
