import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobAssessment } from "@/lib/ai/task-contracts";
import { createTestClient, resetDatabase } from "@/test/db";

import { persistAssessment } from "./assess";
import type { Weights } from "./weights";

const db = vi.hoisted(() => ({
  client: undefined as ReturnType<typeof createTestClient> | undefined,
  /** Achievement ids the stubbed library says exist and are not rejected. */
  verified: ["ach-1", "ach-2"],
}));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
// career/ is another module's file; the stub keeps these tests on the one
// function the assessment service may call (master.md §3.3).
vi.mock("@/lib/career/achievements", () => ({
  verifiedAchievementIds: async (ids: string[]) => ids.filter((id) => db.verified.includes(id)),
}));
const prisma = () => db.client!;

const assessment: JobAssessment = {
  schema_version: "1.0",
  task: "job_assessment",
  decision: {
    recommendation: "APPLY",
    compatibilityScore: 88,
    confidence: "HIGH",
    mandatoryRejection: false,
    summary: "Strong technical fit for the platform work.",
  },
  dimensions: {
    technicalSkills: 90,
    relevantExperience: 85,
    responsibilities: 80,
    architecture: 70,
    seniority: 80,
    domain: 60,
    locationRemote: 90,
    employmentConditions: 75,
  },
  requirements: [
    { requirement: "Kubernetes production experience", importance: "REQUIRED", status: "STRONG_EVIDENCE", evidenceIds: ["ach-1", "ach-ghost"], jdQuotes: ["You will run our Kubernetes clusters"], explanation: "Production cluster work.", confidence: "HIGH" },
    { requirement: "Rust", importance: "REQUIRED", status: "STRONG_EVIDENCE", evidenceIds: ["ach-ghost-only"], jdQuotes: ["Strong Rust skills"], explanation: "Needed for the edge proxy.", confidence: "MEDIUM" },
    { requirement: "Fintech background", importance: "PREFERRED", status: "TRANSFERABLE", evidenceIds: [], jdQuotes: ["Payments experience a plus"], explanation: "Adjacent billing work.", confidence: "LOW" },
  ],
  strengths: ["Runs production Kubernetes"],
  gaps: ["No Rust"],
  transferableSkills: ["Billing systems"],
  risks: ["Rust ramp-up"],
  nextActions: ["Read the Rust book"],
};

const mandatoryRules = [{ rule: "salary-below-minimum", reason: "The pay stated in the advert tops out below your minimum." }];

let postingId: string;

beforeEach(async () => {
  await resetDatabase(prisma());
  db.verified = ["ach-1", "ach-2"];
  const posting = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "job-1", title: "Backend Engineer", company: "Northwind", place: "Berlin" } });
  postingId = posting.id;
});
afterAll(() => prisma().$disconnect());

describe("persistAssessment", () => {
  it("checks the evidence ids against the library, downgrades unbacked strong matches, and stores the score", async () => {
    const row = await persistAssessment({ postingId, assessment, mandatoryRules: [], promptVersion: "assess-job@1" });
    expect(row).toMatchObject({ postingId, stage: "ASSESSED", decision: "STRONG_MATCH", confidence: "HIGH", assessedWith: "assess-job@1" });
    // 90x25 + 85x20 + 80x15 + 70x10 + 80x10 + 60x5 + 90x10 + 75x5, over 100.
    expect(row.score).toBe(82);
    const requirements = row.requirements as JobAssessment["requirements"];
    expect(requirements?.[0]).toMatchObject({ requirement: "Kubernetes production experience", status: "STRONG_EVIDENCE", evidenceIds: ["ach-1"] });
    expect(requirements?.[1]).toMatchObject({ requirement: "Rust", status: "PARTIAL_EVIDENCE", evidenceIds: [] });
    expect(requirements?.[2]).toMatchObject({ requirement: "Fintech background", status: "TRANSFERABLE", evidenceIds: [] });
  });

  it("records why every stage passed, and the AI's own recommendation", async () => {
    const row = await persistAssessment({ postingId, assessment, mandatoryRules: [], promptVersion: "assess-job@1" });
    const reasons = row.reasons as string[];
    expect(reasons).toContain("AI recommendation APPLY, weighted score 82 of 100.");
    expect(reasons).toContain("1 strong match dropped to partial evidence after checking the library.");
    expect(reasons).toContain("2 achievement references dropped: not in the evidence library.");
    expect(reasons).toContain("No mandatory rejection rule matched.");
    expect(row.rejectedReason).toBe("");
  });

  it("does not downgrade when the library backs the strong match", async () => {
    db.verified = ["ach-1", "ach-2", "ach-ghost-only"];
    const row = await persistAssessment({ postingId, assessment, mandatoryRules: [], promptVersion: "assess-job@1" });
    const requirements = row.requirements as JobAssessment["requirements"];
    expect(requirements?.[1]).toMatchObject({ requirement: "Rust", status: "STRONG_EVIDENCE", evidenceIds: ["ach-ghost-only"] });
    const reasons = row.reasons as string[];
    expect(reasons).not.toContain("1 strong match dropped to partial evidence after checking the library.");
  });

  it("lets a mandatory rule force REJECT whatever the score said, keeping the AI's recommendation", async () => {
    const row = await persistAssessment({ postingId, assessment, mandatoryRules, promptVersion: "assess-job@1" });
    expect(row.decision).toBe("REJECT");
    expect(row.score).toBe(82);
    expect(row.rejectedReason).toBe(mandatoryRules[0].reason);
    const reasons = row.reasons as string[];
    expect(reasons).toContain("AI recommendation APPLY, weighted score 82 of 100.");
    expect(reasons).toContain(`Mandatory rule salary-below-minimum: ${mandatoryRules[0].reason}`);
  });

  it("maps every recommendation onto its decision", async () => {
    const pairs: [JobAssessment["decision"]["recommendation"], string][] = [
      ["APPLY", "STRONG_MATCH"],
      ["APPLY_AFTER_PREPARATION", "POTENTIAL_MATCH"],
      ["SAVE_FOR_LATER", "WEAK_MATCH"],
      ["REJECT", "REJECT"],
    ];
    for (const [recommendation, expected] of pairs) {
      // The same posting's row is upserted each time; only the mapping varies.
      const row = await persistAssessment({ postingId, assessment: { ...assessment, decision: { ...assessment.decision, recommendation } }, mandatoryRules: [], promptVersion: "assess-job@1" });
      expect(row.decision).toBe(expected);
    }
  });

  it("scores with the weights given, instead of the stored ones", async () => {
    const weights: Weights = { technicalSkills: 100, relevantExperience: 0, responsibilities: 0, architecture: 0, seniority: 0, domain: 0, locationRemote: 0, employmentConditions: 0 };
    const row = await persistAssessment({ postingId, assessment, mandatoryRules: [], weights, promptVersion: "assess-job@1" });
    expect(row.score).toBe(90);
  });

  it("updates the posting's row instead of adding a second one", async () => {
    await persistAssessment({ postingId, assessment, mandatoryRules: [], promptVersion: "assess-job@1" });
    const again = await persistAssessment({ postingId, assessment: { ...assessment, decision: { ...assessment.decision, recommendation: "SAVE_FOR_LATER" } }, mandatoryRules: [], promptVersion: "assess-job@2" });
    expect(again.decision).toBe("WEAK_MATCH");
    expect(again.assessedWith).toBe("assess-job@2");
    expect(await prisma().jobAssessment.count()).toBe(1);
  });

  it("links the search profile when one is given", async () => {
    const profile = await prisma().jobSearchProfile.create({
      data: {
        name: "Backend",
        source: "JSEARCH",
        query: {},
        titles: [],
        altTitles: [],
        requiredKeywords: [],
        excludedKeywords: [],
        requiredTech: [],
        preferredTech: [],
        excludedTech: [],
        seniority: [],
        employmentTypes: [],
        remoteCountries: ["DE"],
        companyBlacklist: [],
        companyWhitelist: [],
        industries: [],
      },
    });
    const row = await persistAssessment({ postingId, profileId: profile.id, assessment, mandatoryRules: [], promptVersion: "assess-job@1" });
    expect(row.profileId).toBe(profile.id);
    // A later run that doesn't name a profile leaves the link alone; a new
    // profileId replaces it.
    const unlinked = await persistAssessment({ postingId, assessment, mandatoryRules: [], promptVersion: "assess-job@1" });
    expect(unlinked.profileId).toBe(profile.id);
  });
});
