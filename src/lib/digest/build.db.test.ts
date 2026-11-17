import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { buildDigest } from "./build";

// buildDigest reads the last 24 hours from the database alone: runs, the best
// assessments, open gap questions and new salary figures. Seeded rows, real sums.

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});

const prisma = () => db.client!;

beforeEach(async () => {
  await resetDatabase(prisma());
});
afterAll(() => prisma().$disconnect());

/** One enabled profile with its criteria, and a paused one. */
async function seedProfiles() {
  const base = { altTitles: [], requiredKeywords: [], excludedKeywords: [], requiredTech: [], preferredTech: [], excludedTech: [], seniority: [], employmentTypes: [], remoteCountries: [], companyBlacklist: [], companyWhitelist: [], industries: [] };
  const active = await prisma().jobSearchProfile.create({
    data: { name: "Backend", source: "JSEARCH", query: { keywords: "backend", country: "de", remoteOnly: false, postedWithin: "any", radiusKm: 25, place: "" }, titles: ["Backend Engineer"], ...base },
  });
  await prisma().jobSearchProfile.create({
    data: { name: "Paused", enabled: false, source: "ADZUNA", query: { keywords: "data", country: "nl", remoteOnly: true, postedWithin: "any", radiusKm: 25, place: "" }, titles: ["Data Engineer"], ...base },
  });
  return active;
}

describe("buildDigest", () => {
  it("sums the day's runs stage by stage, and a run without stats is left out", async () => {
    const profile = await seedProfiles();
    const stats = { fetched: 10, duplicates: 4, deterministicRejected: 3, screened: 2, shortlisted: 2, assessed: 1, failed: 0, message: "done" };
    await prisma().discoveryRun.create({ data: { profileId: profile.id, status: "DONE", stats } });
    await prisma().discoveryRun.create({ data: { profileId: profile.id, status: "DONE", stats: { ...stats, shortlisted: 1, assessed: 1 } } });
    await prisma().discoveryRun.create({ data: { profileId: profile.id, status: "QUEUED" } });

    const digest = await buildDigest();
    expect(digest.counts).toEqual({ discovered: 12, rejectedDeterministic: 6, screened: 4, shortlisted: 3, assessed: 2 });
  });

  it("lists the day's best matches, strong before potential, best score first, with the posting's details", async () => {
    const profile = await seedProfiles();
    const first = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "p1", title: "Backend Engineer", company: "Ledgerly", url: "https://jobs.example/1" } });
    const second = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "p2", title: "Platform Engineer", company: "Acme", url: "https://jobs.example/2" } });
    const third = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "p3" } });
    await prisma().jobAssessment.create({ data: { postingId: second.id, profileId: profile.id, stage: "ASSESSED", decision: "POTENTIAL_MATCH", score: 91, reasons: ["Good platform fit"] } });
    await prisma().jobAssessment.create({ data: { postingId: first.id, profileId: profile.id, stage: "ASSESSED", decision: "STRONG_MATCH", score: 84, reasons: ["Strong TypeScript match", "Berlin, hybrid"] } });
    // A rejection never appears: one assessment per posting, so it lives on the third posting.
    await prisma().jobAssessment.create({ data: { postingId: third.id, stage: "DETERMINISTIC", decision: "REJECT", reasons: ["Too junior"], rejectedReason: "Too junior" } });

    const digest = await buildDigest();
    expect(digest.bestMatches).toEqual([
      { postingId: first.id, title: "Backend Engineer", company: "Ledgerly", score: 84, reasons: ["Strong TypeScript match", "Berlin, hybrid"], url: "https://jobs.example/1" },
      { postingId: second.id, title: "Platform Engineer", company: "Acme", score: 91, reasons: ["Good platform fit"], url: "https://jobs.example/2" },
    ]);
  });

  it("counts the open gap questions, whatever raised them", async () => {
    await prisma().gapQuestion.create({ data: { question: "Which team would you join?", status: "OPEN" } });
    await prisma().gapQuestion.create({ data: { question: "How large was the migration?", status: "OPEN" } });
    await prisma().gapQuestion.create({ data: { question: "Answered one", status: "ANSWERED", answer: "Forty services." } });

    const digest = await buildDigest();
    expect(digest.gapQuestionsOpen).toBe(2);
    expect(digest.nextActions).toContain("Answer 2 open gap questions");
  });

  it("keeps new salary figures as one line each, with the basis on record", async () => {
    await seedProfiles();
    const now = Date.now();
    const posting = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "p1" } });
    await prisma().salaryEstimate.create({
      // Older: the digest lists the newest figures first.
      data: { postingId: posting.id, company: "Ledgerly", title: "Backend Engineer", status: "ESTIMATED", minimum: 60000, median: 68000, maximum: 76000, currency: "EUR", basis: "ANNUAL", sources: [], createdAt: new Date(now - 60_000) },
    });
    await prisma().salaryEstimate.create({
      data: { company: "Acme", title: "Data Engineer", status: "STATED", minimum: 90, maximum: 120, currency: "EUR", basis: "HOURLY", sources: [], createdAt: new Date(now) },
    });
    // No figure on record: it stays out, nothing is invented.
    await prisma().salaryEstimate.create({ data: { company: "Blank", title: "Intern", status: "UNAVAILABLE", sources: [] } });

    const digest = await buildDigest();
    expect(digest.salaryInsights).toEqual([
      { company: "Acme", title: "Data Engineer", label: "EUR 90 to EUR 120 an hour" },
      { company: "Ledgerly", title: "Backend Engineer", label: "EUR 68,000 median a year" },
    ]);
  });

  it("derives the next steps from what's actually waiting, and a quiet day has none", async () => {
    const quiet = await buildDigest();
    expect(quiet.nextActions).toEqual([]);

    const profile = await seedProfiles();
    const posting = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "p1" } });
    await prisma().jobAssessment.create({ data: { postingId: posting.id, profileId: profile.id, stage: "ASSESSED", decision: "STRONG_MATCH", score: 80, reasons: [] } });
    await prisma().gapQuestion.create({ data: { question: "Which team?", status: "OPEN" } });

    const digest = await buildDigest();
    expect(digest.nextActions).toEqual(["Review 1 shortlisted job", "Answer 1 open gap question", "Run discovery for 1 paused profile"]);
  });
});
