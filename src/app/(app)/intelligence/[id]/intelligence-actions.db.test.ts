import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { PROMPT_VERSIONS, assessJobKey, assessPostingJob, critiquePostingJob, generateGapQuestionsJob, researchSalaryJob } from "./jobs";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
// The runner's import graph reads the env for the AI settings; the jobs under
// test get their provider from routing, which is stubbed below.
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "0123456789abcdef0123456789abcdef" } }));
vi.mock("@/lib/ai/task-options", () => ({ loadTaskOptions: async () => ({ creativity: "FAITHFUL" as const, strict: true, language: null }) }));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile() };
});
// One mock AI per task, answering from code (E11-2): what each task is asked
// is set per test through `answers`.
const fake = vi.hoisted(() => ({ answers: {} as Record<string, unknown> }));
vi.mock("@/lib/ai/routing", async () => {
  const { MockProvider } = await import("@/lib/ai/providers/mock");
  return { getProviderForTask: async (task: string) => new MockProvider({ reply: () => fake.answers[task] }) };
});

const prisma = () => db.client!;

const assessment = (requirements: Record<string, unknown>[]) => ({
  schema_version: "1.0",
  task: "job_assessment",
  decision: { recommendation: "APPLY", compatibilityScore: 88, confidence: "HIGH", mandatoryRejection: false, summary: "Strong technical fit for the platform work." },
  dimensions: { technicalSkills: 90, relevantExperience: 85, responsibilities: 80, architecture: 70, seniority: 80, domain: 60, locationRemote: 90, employmentConditions: 75 },
  requirements,
  strengths: ["Runs production Kubernetes"],
  gaps: ["No Rust"],
  transferableSkills: ["Billing systems"],
  risks: ["Rust ramp-up"],
  nextActions: ["Read the Rust book"],
});

const requirement = (overrides: Record<string, unknown> = {}) => ({
  requirement: "Kubernetes production experience",
  importance: "PREFERRED",
  status: "STRONG_EVIDENCE",
  evidenceIds: [],
  jdQuotes: ["You will run our Kubernetes clusters"],
  explanation: "Production cluster work.",
  confidence: "HIGH",
  ...overrides,
});

const context = () => {
  const steps: string[] = [];
  return { id: "intelligence-job", steps, step: async (name: string) => void steps.push(name), signal: new AbortController().signal };
};

let postingId: string;

beforeEach(async () => {
  await resetDatabase(prisma());
  fake.answers = {};
  const posting = await prisma().posting.create({
    data: { source: "JSEARCH", externalId: "job-1", title: "Backend Engineer", company: "Northwind", place: "Berlin", remote: true, salary: "", description: "The whole JD." },
  });
  postingId = posting.id;
});
afterAll(() => prisma().$disconnect());

describe("the assess-posting job", () => {
  it("assesses against the profile and keeps the assessment with its reasons", async () => {
    const achievement = await prisma().careerAchievement.create({
      data: { title: "Runs production Kubernetes", origin: "test", technologies: [], metrics: [], tags: [], skills: [], versions: [] },
    });
    fake.answers["assess-job"] = assessment([
      requirement({ importance: "REQUIRED", evidenceIds: [achievement.id, "ach-ghost"] }),
      requirement({ requirement: "Rust", status: "CONFIRMED_GAP", importance: "PREFERRED", explanation: "Nothing rules it in or out." }),
    ]);
    const run = context();
    expect(await assessPostingJob.run({ postingId }, run)).toEqual({ assessmentId: expect.any(String) });
    expect(run.steps).toEqual(["Reading the posting", "Assessing it against your profile", "Applying the mandatory rejection rules"]);

    const row = await prisma().jobAssessment.findUniqueOrThrow({ where: { postingId } });
    // 90x25 + 85x20 + 80x15 + 70x10 + 80x10 + 60x5 + 90x10 + 75x5, over 100.
    expect(row).toMatchObject({ postingId, stage: "ASSESSED", decision: "STRONG_MATCH", score: 82, confidence: "HIGH", assessedWith: PROMPT_VERSIONS.assess });
    expect(row.requirements).toEqual([
      expect.objectContaining({ requirement: "Kubernetes production experience", status: "STRONG_EVIDENCE", evidenceIds: [achievement.id] }),
      expect.objectContaining({ requirement: "Rust", status: "CONFIRMED_GAP" }),
    ]);
    // The task's own cleaning dropped the ghost id before anything was kept,
    // so the reasons have nothing left to report about the library.
    expect(row.reasons).toEqual(["AI recommendation APPLY, weighted score 82 of 100.", "No mandatory rejection rule matched."]);
  });

  it("lets a mandatory rule force REJECT: a required technology nothing backs", async () => {
    fake.answers["assess-job"] = assessment([requirement({ requirement: "Rust", importance: "REQUIRED", status: "CONFIRMED_GAP" })]);
    await assessPostingJob.run({ postingId }, context());

    const row = await prisma().jobAssessment.findUniqueOrThrow({ where: { postingId } });
    expect(row.decision).toBe("REJECT");
    expect(row.rejectedReason).toContain("required technology");
    expect(row.reasons).toEqual([
      "AI recommendation APPLY, weighted score 82 of 100.",
      "Mandatory rule missing-required-tech: Nothing in your evidence library backs the required technology: Rust.",
    ]);
  });

  it("keeps the pay the advert states as a STATED estimate (master.md Phase 4)", async () => {
    await prisma().posting.update({ where: { id: postingId }, data: { salary: "EUR 60,000-75,000 a year" } });
    fake.answers["assess-job"] = assessment([]);
    await assessPostingJob.run({ postingId }, context());

    expect(await prisma().salaryEstimate.findUniqueOrThrow({ where: { postingId } })).toMatchObject({
      postingId,
      status: "STATED",
      minimum: 60000,
      maximum: 75000,
      currency: "EUR",
      basis: "ANNUAL",
      sourceCount: 0,
    });
  });

  it("keys a posting's assessment, so a second click follows the first", () => {
    expect(assessJobKey("p1")).toBe("assess-posting:p1");
  });
});

describe("the research-posting-salary job", () => {
  it("says Unavailable when there are no notes to research from, and invents nothing", async () => {
    // The model talks itself into a figure anyway; the job doesn't keep it.
    fake.answers["salary-research"] = {
      schema_version: "1.0",
      task: "salary_research",
      status: "ESTIMATED",
      minimum: 70000,
      median: 80000,
      maximum: 90000,
      currency: "EUR",
      basis: "ANNUAL",
      confidence: "MEDIUM",
      sources: [],
      methodology: "A guess.",
    };
    expect(await researchSalaryJob.run({ postingId }, context())).toEqual({ status: "UNAVAILABLE" });

    const row = await prisma().salaryEstimate.findUniqueOrThrow({ where: { postingId } });
    expect(row).toMatchObject({
      status: "UNAVAILABLE",
      minimum: null,
      median: null,
      maximum: null,
      sources: [],
      methodology: "No salary sources were available to research from, so no figure is given.",
      researchedWith: PROMPT_VERSIONS.salary,
    });
  });
});

describe("the critique-posting job", () => {
  it("works the critique out from the stored assessment, and says so", async () => {
    fake.answers["assess-job"] = assessment([
      requirement({ importance: "REQUIRED" }),
      requirement({ requirement: "Rust", importance: "PREFERRED", status: "CONFIRMED_GAP", explanation: "Needed for the edge proxy." }),
    ]);
    await assessPostingJob.run({ postingId }, context());

    const run = context();
    expect(await critiquePostingJob.run({ postingId }, run)).toEqual({ recommendation: "APPLY" });
    expect(run.steps).toEqual(["Working from the assessment"]);

    const row = await prisma().jobAssessment.findUniqueOrThrow({ where: { postingId } });
    expect(row.critique).toMatchObject({
      suitable: [expect.stringContaining("Kubernetes production experience")],
      lacking: [expect.stringContaining("Rust")],
      recommendation: "APPLY",
    });
    expect((row.critique as { reasoning: string }).reasoning).toContain("derived-from-assessment");
  });

  it("refuses to run before an assessment", async () => {
    await expect(critiquePostingJob.run({ postingId }, context())).rejects.toThrow("assess the posting first");
  });
});

describe("the generate-posting-gap-questions job", () => {
  it("asks what only the candidate knows, through the lifecycle", async () => {
    fake.answers["gap-questions"] = {
      schema_version: "1.0",
      task: "gap_questions",
      questions: [
        {
          id: "q1",
          question: "What volume did your Kafka systems process?",
          reason: "The JD asks for high-throughput systems",
          relatedRequirement: "High-throughput distributed systems",
          expectedInformation: ["approximate volume"],
          questionType: "METRICS",
          priority: "CRITICAL",
          alreadyKnown: false,
        },
      ],
    };
    expect(await generateGapQuestionsJob.run({ postingId }, context())).toEqual({ count: 1 });
    const [row] = await prisma().gapQuestion.findMany({ where: { postingId } });
    expect(row).toMatchObject({ question: "What volume did your Kafka systems process?", status: "OPEN", generatedWith: PROMPT_VERSIONS.gaps });
  });
});
