import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { createTestClient, resetDatabase } from "@/test/db";

import { seedBuiltIns } from "../../prisma/seed/built-ins";
import { seedDemo } from "../../prisma/seed/demo";

import { loadCareerIntel, loadDashboard } from "./dashboard-data";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});

const prisma = () => db.client!;
const now = new Date(2026, 8, 27, 12);

beforeEach(async () => {
  await resetDatabase(prisma());
  await seedBuiltIns(prisma());
  await seedDemo(prisma(), { now });
});
afterAll(() => prisma().$disconnect());

describe("loadDashboard against the demo seed (E9-6)", () => {
  it("has 7 sent, 5 heard back (71%) and 3 that reached an interview", async () => {
    const figures = await loadDashboard({}, now);
    expect(figures).toMatchObject({ sent: 7, heardBack: 5, heardBackPercent: 71, reachedInterview: 3 });
    expect(figures.funnel.map((step) => step.count)).toEqual([7, 5, 3, 2, 0]);
    expect(figures.funnel.map((step) => step.stopped)).toEqual([
      { open: 2, rejected: 0, declined: 0, archived: 0 },
      { open: 1, rejected: 1, declined: 0, archived: 0 },
      { open: 1, rejected: 0, declined: 0, archived: 0 },
      { open: 1, rejected: 0, declined: 1, archived: 0 },
      { open: 0, rejected: 0, declined: 0, archived: 0 },
    ]);
    expect(figures.byStatus).toEqual({ DRAFT: 2, SENT: 2, SCREENING: 1, INTERVIEW: 1, OFFER: 1, ACCEPTED: 0, REJECTED: 1, DECLINED: 1 });
  });

  it("lists tomorrow's interview, the offer, the drafts and the quiet one", async () => {
    const figures = await loadDashboard({ timeZone: "Europe/Amsterdam" }, now);
    expect(figures.attention.map((item) => `${item.company}: ${item.reason}`)).toEqual([
      "Northstar Health: Interview tomorrow at 14:00. Worth re-reading your tailored letter first.",
      "Oaken Studio: An offer is waiting on your decision.",
      "Brightline Transit: Still a draft, and applications close 3 Oct.",
      "Ledgerly: Still a draft, and applications close 15 Oct.",
      "Kestrel Maps: No news for 7 days. A short, friendly follow-up could help.",
    ]);
    expect(figures.attention[0].soon).toBe(true);
  });

  it("nudges sooner or later as set (E9-9)", async () => {
    const quiet = async (quietDays: number) =>
      (await loadDashboard({ quietDays }, now)).attention.filter((item) => item.reason.startsWith("No news")).map((item) => item.company);
    expect(await quiet(3)).toEqual(["Kestrel Maps", "Tidewater Energy", "Meridian Bank"]);
    expect(await quiet(14)).toEqual([]);
  });

  it("still counts archived applications in the funnel", async () => {
    await prisma().application.updateMany({ where: { company: "Quill & Co" }, data: { archivedAt: now } });
    const figures = await loadDashboard({}, now);
    expect(figures).toMatchObject({ sent: 7, heardBack: 5, reachedInterview: 3 });
    expect(figures.byStatus.DECLINED).toBe(1);
    // Closed before it was archived, so it still counts as declined.
    expect(figures.funnel[3].stopped).toMatchObject({ declined: 1, archived: 0 });
  });

  it("counts an application archived while still open apart (decided 16 October 2026)", async () => {
    await prisma().application.updateMany({ where: { company: "Kestrel Maps" }, data: { archivedAt: now } });
    const figures = await loadDashboard({}, now);
    expect(figures.funnel[0].stopped).toEqual({ open: 1, rejected: 0, declined: 0, archived: 1 });
  });
});

describe("loadCareerIntel (Phase 14)", () => {
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const addProfile = async (enabled = true) =>
    prisma().jobSearchProfile.create({
      data: {
        name: "Frontend roles",
        source: "JSEARCH",
        enabled,
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
        remoteCountries: [],
        companyBlacklist: [],
        companyWhitelist: [],
        industries: [],
      },
    });

  let posting = 0;
  const addPosting = async (title: string, company: string) =>
    prisma().posting.create({ data: { source: "JSEARCH", externalId: `career-${++posting}`, title, company } });

  const addRun = async (profileId: string, days: number, stats: Prisma.InputJsonValue) =>
    prisma().discoveryRun.create({ data: { profileId, status: "DONE", stats, createdAt: daysAgo(days) } });

  const addAssessment = async (data: { stage?: string; decision?: "STRONG_MATCH" | "POTENTIAL_MATCH" | "WEAK_MATCH" | "REJECT" | "PENDING"; score?: number | null } = {}) => {
    const posting = await addPosting("Role", "Company");
    return prisma().jobAssessment.create({
      data: { postingId: posting.id, stage: data.stage ?? "ASSESSED", decision: data.decision ?? "PENDING", score: data.score ?? null, reasons: [] },
    });
  };

  const addQuestion = async (prepared: boolean) => {
    const plan = await prisma().interviewPlan.create({ data: { role: "Senior Service Designer", rounds: [] } });
    return prisma().interviewQuestion.create({
      data: { planId: plan.id, category: "BEHAVIORAL", question: "Tell me about a launch.", expectedTopics: [], answerStructure: [], evidenceIds: [], followUps: [], commonMistakes: [], resources: [], prepared },
    });
  };

  const addTopic = async (status: "NOT_STARTED" | "LEARNING" | "COMPLETED") => {
    const plan = await prisma().learningPlan.create({ data: {} });
    return prisma().learningTopic.create({ data: { planId: plan.id, title: "Design systems", prerequisites: [], exercises: [], miniProjects: [], interviewQuestions: [], resources: [], status } });
  };

  const addMock = async (score: number | null, status: "IN_PROGRESS" | "COMPLETED" = "COMPLETED") =>
    prisma().mockSession.create({ data: { kind: "TEXT", status, turns: [], score, finishedAt: status === "COMPLETED" ? now : null } });

  const addUsage = async (data: { inputTokens?: number; outputTokens?: number; estimatedCost?: number; success?: boolean; days?: number } = {}) =>
    prisma().aiUsageLog.create({
      data: {
        task: "assess-job",
        provider: "OPENAI",
        model: "test",
        durationMs: 10,
        success: data.success ?? true,
        error: data.success === false ? "rate limited" : "",
        inputTokens: data.inputTokens ?? null,
        outputTokens: data.outputTokens ?? null,
        estimatedCost: data.estimatedCost ?? null,
        createdAt: daysAgo(data.days ?? 0),
      },
    });

  it("has nothing to show on the demo seed alone", async () => {
    expect(await loadCareerIntel(now)).toBeNull();
  });

  it("sums the new jobs the last 7 days of runs fetched, and only those", async () => {
    const profile = await addProfile();
    await addRun(profile.id, 1, { fetched: 40, duplicates: 10 });
    await addRun(profile.id, 2, { fetched: 3 });
    await addRun(profile.id, 8, { fetched: 100 }); // Outside the window.
    await addRun(profile.id, 1, { nope: true }); // Stats that can't be read count nothing, never a guess.
    expect((await loadCareerIntel(now))!.newJobs).toBe(43);
  });

  it("shows no new jobs without an enabled profile, but still the best matches", async () => {
    await addProfile(false);
    const posting = await addPosting("Senior Service Designer", "Lumen Works");
    await prisma().jobAssessment.create({ data: { postingId: posting.id, stage: "ASSESSED", decision: "STRONG_MATCH", score: 92, reasons: [] } });
    const intel = await loadCareerIntel(now);
    expect(intel!.newJobs).toBeNull();
    expect(intel!.bestMatches).toEqual([{ postingId: posting.id, title: "Senior Service Designer", company: "Lumen Works", score: 92, decision: "STRONG_MATCH" }]);
  });

  it("lists the top three matches by score, and never a rejection whatever its score", async () => {
    for (const [score, decision] of [[92, "STRONG_MATCH"], [78, "POTENTIAL_MATCH"], [85, "STRONG_MATCH"], [99, "REJECT"]] as const) {
      const posting = await addPosting(`Role ${score}`, "Company");
      await prisma().jobAssessment.create({ data: { postingId: posting.id, stage: "ASSESSED", decision, score, reasons: [] } });
    }
    const intel = await loadCareerIntel(now);
    expect(intel!.bestMatches.map((match) => [match.score, match.decision])).toEqual([[92, "STRONG_MATCH"], [85, "STRONG_MATCH"], [78, "POTENTIAL_MATCH"]]);
  });

  it("counts the jobs waiting on a review decision, and the open gap questions", async () => {
    await addAssessment({ decision: "PENDING", score: 70 }); // Undecided, and scored well enough.
    await addAssessment({ decision: "PENDING", score: 59 }); // Not scored well enough.
    await addAssessment({ stage: "SCREENED", decision: "PENDING", score: 80 }); // The pipeline isn't done with it.
    await addAssessment({ stage: "SCREENED" }); // Nothing to review yet.
    await addAssessment({ decision: "STRONG_MATCH", score: 90 }); // Already decided.
    await prisma().gapQuestion.create({ data: { question: "What did you ship?", status: "OPEN" } });
    await prisma().gapQuestion.create({ data: { question: "What did you ship?", status: "OPEN" } });
    await prisma().gapQuestion.create({ data: { question: "What did you ship?", status: "ANSWERED" } });
    expect((await loadCareerIntel(now))!.review).toEqual({ jobs: 2, questions: 2 });
  });

  it("summarises preparation progress from the real rows", async () => {
    await addQuestion(true);
    await addQuestion(false);
    await addQuestion(false);
    await addTopic("COMPLETED");
    await addTopic("LEARNING");
    await addTopic("NOT_STARTED");
    await addMock(70);
    await addMock(79);
    await addMock(null, "IN_PROGRESS"); // Not finished, so not counted.
    expect((await loadCareerIntel(now))!.progress).toEqual({ preparedQuestions: 1, totalQuestions: 3, completedTopics: 1, totalTopics: 3, mockSessions: 2, mockMeanScore: 75 });
  });

  it("reports a mock session without a score honestly", async () => {
    await addMock(null);
    expect((await loadCareerIntel(now))!.progress).toEqual({ preparedQuestions: 0, totalQuestions: 0, completedTopics: 0, totalTopics: 0, mockSessions: 1, mockMeanScore: null });
  });

  it("shows the latest three salary estimates with the wording the salary rules require", async () => {
    const oldest = await addPosting("Senior Service Designer", "Lumen Works");
    await prisma().salaryEstimate.create({ data: { postingId: oldest.id, company: "Lumen Works", title: "Senior Service Designer", status: "CONFIRMED", minimum: 60000, maximum: 80000, currency: "EUR", sources: [] } });
    await sleep(15);
    await prisma().salaryEstimate.create({ data: { company: "Fieldnote", title: "Product Designer", status: "ESTIMATED", minimum: 55000, maximum: 70000, currency: "EUR", sources: [] } });
    await sleep(15);
    await prisma().salaryEstimate.create({ data: { company: "Oaken Studio", title: "Design Systems Lead", status: "UNAVAILABLE", sources: [] } });
    await sleep(15);
    const latest = await addPosting("Senior Service Designer", "Brightline");
    await prisma().salaryEstimate.create({ data: { postingId: latest.id, company: "Brightline", title: "Senior Service Designer", status: "STATED", minimum: 70000, maximum: 90000, currency: "EUR", sources: [] } });
    const intel = await loadCareerIntel(now);
    expect(intel!.salaries.map((salary) => [salary.range, salary.statusLabel])).toEqual([
      ["EUR 70,000 – EUR 90,000", "Stated in the job ad"],
      [null, "Unavailable"],
      ["EUR 55,000 – EUR 70,000", "Estimated from market data"],
    ]);
    // The latest is tied to its posting's intelligence page; the company-level rows have none to open.
    expect(intel!.salaries[0].postingId).toBe(latest.id);
    expect(intel!.salaries[1].postingId).toBeNull();
    expect(intel!.salaries).toHaveLength(3); // The oldest falls off.
  });

  it("reports AI use over the last 7 days, and only the figures the providers reported", async () => {
    await addUsage({ inputTokens: 100, outputTokens: 50 });
    await addUsage({ inputTokens: 200, outputTokens: 70 });
    await addUsage({ success: false }); // Failed, and reported no tokens.
    await addUsage({ inputTokens: 999, outputTokens: 999, days: 8 }); // Outside the window.
    expect((await loadCareerIntel(now))!.usage).toEqual({ calls: 3, failures: 1, inputTokens: 300, outputTokens: 120, estimatedCost: null });
  });

  it("sums the estimated cost when a price could be applied", async () => {
    await addUsage({ estimatedCost: 12 });
    await addUsage({ estimatedCost: 30 });
    expect((await loadCareerIntel(now))!.usage.estimatedCost).toBe(42);
  });

  it("recommends the next actions from the real counts, at most three", async () => {
    await addProfile(); // A profile, but no runs in the last 7 days.
    await addAssessment({ decision: "PENDING", score: 70 });
    await prisma().gapQuestion.create({ data: { question: "What did you ship?", status: "OPEN" } });
    await addQuestion(false);
    const intel = await loadCareerIntel(now);
    expect(intel!.actions).toEqual([
      { reason: "1 gap question waits for answers.", href: "/interview", action: "Answer" },
      { reason: "1 job waits for your review.", href: "/discovery", action: "Review" },
      { reason: "No discovery runs in the last 7 days. Run one from Discovery.", href: "/discovery", action: "Run" },
    ]); // The fourth (one interview question left to prepare) is beyond the three shown.
  });

  it("recommends nothing when everything is done", async () => {
    const profile = await addProfile();
    await addRun(profile.id, 1, { fetched: 5 });
    await addAssessment({ decision: "STRONG_MATCH", score: 90 });
    await addQuestion(true);
    expect((await loadCareerIntel(now))!.actions).toEqual([]);
  });
});
