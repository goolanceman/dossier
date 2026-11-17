import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AssessmentDecision, RunStatus } from "@/generated/prisma/enums";
import type { FoundPosting } from "@/lib/job-search/search";
import { JobSearchError } from "@/lib/job-search/errors";
import type { JobContext } from "@/lib/jobs/runner";
import { createTestClient, resetDatabase } from "@/test/db";

import { runDiscoveryPipeline } from "./pipeline";
import { createProfile, type SearchProfileParams } from "./profile";
import { discoveryRunJob, runDueProfiles, setPipelineHooks } from "./runner";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
// The pipeline asks the built-in sources through these; here a fake answers.
const fake = vi.hoisted(() => ({ postings: [] as FoundPosting[], next: null as string | null, searches: 0 }));
vi.mock("@/lib/job-search", () => ({
  searchPostings: vi.fn(async () => {
    fake.searches += 1;
    return { postings: fake.postings, next: fake.next };
  }),
}));
vi.mock("@/lib/job-search/config", () => ({
  loadJobSearchConfig: async () => ({ source: "JSEARCH", saved: true }),
  credentialsFor: () => ({ key: "jsearch-key", host: "openwebninja" }),
  requestContext: () => ({}),
}));
// Runs are queued through the runner; here it's enough to see them queued.
vi.mock("@/lib/jobs/runner", () => ({
  defineJob: vi.fn((definition: unknown) => definition),
  findUnfinishedJobs: vi.fn(async () => []),
  startJob: vi.fn(async () => "queued-job"),
}));

const prisma = () => db.client!;

const BASE_DESCRIPTION = "You will build services with Node.js, TypeScript and Postgres. Our team runs on Kafka and ships every day. The role is full-time at our Berlin office.";

const posting = (id: string, extra: Partial<FoundPosting> = {}): FoundPosting => ({
  source: "JSEARCH",
  externalId: id,
  title: "Senior Backend Engineer",
  company: `Company ${id}`,
  place: "Berlin",
  remote: false,
  salary: "EUR 70,000 - 90,000",
  postedAt: "2026-11-16T08:00:00.000Z",
  url: `https://jobs.example/${id}`,
  via: "LinkedIn",
  description: BASE_DESCRIPTION,
  complete: true,
  ...extra,
});

const profileInput: SearchProfileParams = {
  name: "Senior Node.js Backend Engineer",
  source: "JSEARCH" as const,
  query: { keywords: "node.js backend", place: "Berlin", country: "de", radiusKm: 50, remoteOnly: false, postedWithin: "week" as const },
  criteria: {
    titles: ["Backend Engineer"],
    altTitles: [],
    requiredKeywords: [],
    excludedKeywords: ["PHP"],
    requiredTech: ["Node.js"],
    preferredTech: ["Kafka"],
    excludedTech: [],
    seniority: [],
    employmentTypes: [],
    remoteCountries: [],
    companyBlacklist: ["Blackco GmbH"],
    companyWhitelist: [],
    industries: [],
  },
  salaryMin: 60000,
  scheduleKind: "HOURLY" as const,
  maxJobsPerRun: 10,
};

const context = (abort?: AbortController): JobContext & { steps: string[] } => {
  const steps: string[] = [];
  return { id: "discovery-job", steps, step: async (name) => void steps.push(name), signal: (abort ?? new AbortController()).signal };
};

const screen = vi.fn(async () => ({ verdict: "SHORTLIST" as const, reasons: ["Fits the stack."], confidence: "HIGH" as const }));
const assess = vi.fn(async (_id: string, { posting }: { posting: FoundPosting }) => ({
  decision: "STRONG_MATCH" as const,
  score: /node/i.test(posting.description) ? 85 : 40,
  confidence: "HIGH" as const,
  reasons: ["Strong fit."],
  assessedWith: "assess-job@1",
}));

beforeEach(async () => {
  await resetDatabase(prisma());
  fake.postings = [];
  fake.next = null;
  fake.searches = 0;
  screen.mockClear();
  assess.mockClear();
  setPipelineHooks({});
});
afterAll(() => prisma().$disconnect());

describe("runDiscoveryPipeline", () => {
  it("runs every stage: fetch, dedupe, deterministic filter, keyword, screen, assess", async () => {
    const profile = await createProfile(profileInput);
    fake.postings = [
      posting("good"),
      // The same job again, by its link.
      posting("dupe", { url: "https://jobs.example/good?utm_source=feed" }),
      posting("black", { company: "Blackco GmbH" }),
      posting("short", { description: "Too short." }),
      posting("poor", { salary: "EUR 30,000" }),
      posting("php", { title: "PHP Backend Engineer" }),
    ];
    const stats = await runDiscoveryPipeline({ profileId: profile.id, manual: false, screen, assess }, context());
    expect(stats).toMatchObject({ fetched: 6, duplicates: 1, deterministicRejected: 4, screened: 1, shortlisted: 1, assessed: 1, failed: 0 });
    expect(stats.message).toContain("Found 6 postings");

    const rows = await prisma().jobAssessment.findMany({ include: { posting: true }, orderBy: { posting: { externalId: "asc" } } });
    const row = (externalId: string) => rows.find(({ posting }) => posting.externalId === externalId);
    // The shortlisted posting is assessed, with its score and who wrote it.
    expect(row("good")).toMatchObject({ stage: "ASSESSED", decision: AssessmentDecision.STRONG_MATCH, score: 85, confidence: "HIGH", assessedWith: "assess-job@1", rejectedReason: "" });
    expect(row("good")?.reasons).toEqual(["Strong fit."]);
    // Every rejection keeps its reason, machine key and human text.
    expect(row("black")).toMatchObject({ stage: "DETERMINISTIC", decision: AssessmentDecision.REJECT, rejectedReason: "BLACKLISTED_COMPANY" });
    expect(row("short")?.rejectedReason).toBe("INVALID_DESCRIPTION");
    expect(row("poor")?.rejectedReason).toBe("SALARY_BELOW_MINIMUM");
    expect(row("php")?.rejectedReason).toBe("EXCLUDED_KEYWORD");
    expect(row("black")?.reasons).toEqual(["The company is on the profile's blacklist."]);
    // Duplicates are neither stored nor assessed.
    expect(row("dupe")).toBeUndefined();
    expect(await prisma().posting.findMany({ select: { externalId: true } }).then((rows) => rows.map(({ externalId }) => externalId).sort())).toEqual(["black", "good", "php", "poor", "short"]);
    // The run is on record, and the profile's lastRunAt moved.
    const run = await prisma().discoveryRun.findFirstOrThrow();
    expect(run).toMatchObject({ profileId: profile.id, status: RunStatus.DONE, finishedAt: expect.any(Date) });
    expect(run.stats).toMatchObject({ fetched: 6, duplicates: 1 });
    expect((await prisma().jobSearchProfile.findUniqueOrThrow({ where: { id: profile.id } })).lastRunAt).toBeInstanceOf(Date);
  });

  it("brings nothing back that an earlier run assessed", async () => {
    const profile = await createProfile(profileInput);
    fake.postings = [posting("good")];
    await runDiscoveryPipeline({ profileId: profile.id, manual: false, screen, assess }, context());
    const again = await runDiscoveryPipeline({ profileId: profile.id, manual: false, screen, assess }, context());
    expect(again).toMatchObject({ fetched: 1, duplicates: 1, deterministicRejected: 0, assessed: 0 });
    expect(await prisma().jobAssessment.count()).toBe(1);
  });

  it("shortlists by the keyword score when no screen is wired", async () => {
    const profile = await createProfile(profileInput);
    fake.postings = [
      posting("good"),
      // A description with none of the profile's terms: under the shortlist score.
      posting("off-topic", { title: "Dentist", description: "Drill teeth carefully. We have a modern practice in Berlin with friendly staff and a great view over the river." }),
    ];
    const stats = await runDiscoveryPipeline({ profileId: profile.id, manual: false }, context());
    expect(stats).toMatchObject({ fetched: 2, screened: 0, shortlisted: 1, assessed: 0, failed: 0 });
    const rows = await prisma().jobAssessment.findMany({ include: { posting: true } });
    const byExternal = new Map(rows.map((row) => [row.posting.externalId, row]));
    expect(byExternal.get("good")).toMatchObject({ stage: "KEYWORD", decision: AssessmentDecision.PENDING });
    expect(byExternal.get("off-topic")?.reasons).toEqual(["The keyword score didn't reach the shortlist score of 50."]);
    expect(screen).not.toHaveBeenCalled();
    expect(assess).not.toHaveBeenCalled();
  });

  it("leaves the AI stages out that the profile skips", async () => {
    const profile = await createProfile({ ...profileInput, query: { ...profileInput.query, skipStages: ["SCREENED", "ASSESSED"] } });
    fake.postings = [posting("good")];
    const stats = await runDiscoveryPipeline({ profileId: profile.id, manual: false, screen, assess }, context());
    expect(stats).toMatchObject({ fetched: 1, screened: 0, shortlisted: 1, assessed: 0 });
    expect(screen).not.toHaveBeenCalled();
    expect(assess).not.toHaveBeenCalled();
    expect(await prisma().jobAssessment.findFirstOrThrow()).toMatchObject({ stage: "KEYWORD", decision: AssessmentDecision.PENDING });
  });

  it("skips the deterministic filters when the profile says so", async () => {
    const profile = await createProfile({ ...profileInput, query: { ...profileInput.query, skipStages: ["DETERMINISTIC"] } });
    fake.postings = [posting("black", { company: "Blackco GmbH" })];
    const stats = await runDiscoveryPipeline({ profileId: profile.id, manual: false, screen, assess }, context());
    expect(stats).toMatchObject({ fetched: 1, deterministicRejected: 0, assessed: 1 });
    expect(await prisma().jobAssessment.count()).toBe(1);
  });

  it("spends the profile's per-run budget on the best postings first", async () => {
    const profile = await createProfile({ ...profileInput, maxJobsPerRun: 2 });
    fake.postings = [posting("a"), posting("b"), posting("c")];
    const stats = await runDiscoveryPipeline({ profileId: profile.id, manual: false, screen, assess }, context());
    expect(stats).toMatchObject({ fetched: 3, screened: 2, shortlisted: 2, assessed: 2 });
    const pending = await prisma().jobAssessment.findMany({ include: { posting: true }, where: { decision: AssessmentDecision.PENDING } });
    expect(pending.map((row) => row.posting.externalId)).toEqual(["c"]);
    expect(pending[0]?.reasons).toEqual(["The profile assesses at most 2 postings per run."]);
  });

  it("goes on when one screen or assessment fails, and records the run as failed when the source is down", async () => {
    const profile = await createProfile(profileInput);
    screen.mockRejectedValueOnce(new Error("model offline"));
    fake.postings = [posting("good"), posting("other")];
    const stats = await runDiscoveryPipeline({ profileId: profile.id, manual: false, screen, assess }, context());
    expect(stats).toMatchObject({ fetched: 2, screened: 2, failed: 1, assessed: 1 });

    const { searchPostings } = await import("@/lib/job-search");
    vi.mocked(searchPostings).mockRejectedValueOnce(new JobSearchError("unavailable", "JSearch isn't answering right now. Try again in a minute."));
    fake.postings = [posting("fresh")];
    const failed = await runDiscoveryPipeline({ profileId: profile.id, manual: false, screen, assess }, context());
    expect(failed).toMatchObject({ fetched: 0, message: "JSearch isn't answering right now. Try again in a minute." });
    expect(await prisma().discoveryRun.findFirstOrThrow({ orderBy: { createdAt: "desc" } })).toMatchObject({ status: RunStatus.FAILED, error: "JSearch isn't answering right now. Try again in a minute." });
    // lastRunAt moved even for the failed run, so a broken source can't loop.
    expect((await prisma().jobSearchProfile.findUniqueOrThrow({ where: { id: profile.id } })).lastRunAt).toBeInstanceOf(Date);
  });

  it("marks the run cancelled when the job's signal gives out", async () => {
    const profile = await createProfile(profileInput);
    const abort = new AbortController();
    screen.mockImplementationOnce(async () => {
      abort.abort();
      return { verdict: "SHORTLIST" as const, reasons: ["Fits the stack."], confidence: "HIGH" as const };
    });
    fake.postings = [posting("good"), posting("other")];
    const stats = await runDiscoveryPipeline({ profileId: profile.id, manual: false, screen, assess }, context(abort));
    expect(stats).toMatchObject({ message: "Cancelled." });
    expect(await prisma().discoveryRun.findFirstOrThrow()).toMatchObject({ status: RunStatus.CANCELLED });
  });

  it("fails clearly when the profile or its query is gone", async () => {
    await expect(runDiscoveryPipeline({ profileId: "nope", manual: false }, context())).rejects.toThrow("deleted");
    const profile = await createProfile(profileInput);
    await prisma().jobSearchProfile.update({ where: { id: profile.id }, data: { query: { keywords: 42 } } });
    const stats = await runDiscoveryPipeline({ profileId: profile.id, manual: false }, context());
    expect(stats.message).toContain("can't be read");
    expect(await prisma().discoveryRun.findFirstOrThrow()).toMatchObject({ status: RunStatus.FAILED });
  });

  it("fetches from an external source when the query names one", async () => {
    const { stubFetch } = await import("@/lib/ai/test-http");
    const profile = await createProfile({ ...profileInput, query: { ...profileInput.query, externalSourceId: "my-scraper" } });
    await prisma().setting.create({
      data: {
        key: "discovery:external:my-scraper",
        value: JSON.stringify({ id: "my-scraper", kind: "HTTP_SCRAPER", url: "https://scraper.example.com/jobs", token: "scraper-secret", label: "My scraper", enabled: true }),
      },
    });
    const requests = stubFetch(() =>
      Response.json({ postings: [{ source: "ADZUNA", externalId: "scr-1", title: "Backend Engineer", company: "Remote Co", place: "Remote", remote: true, salary: "", postedAt: null, url: "https://jobs.example/scr-1", via: "", description: BASE_DESCRIPTION, complete: true }], next: null }),
    );
    const stats = await runDiscoveryPipeline({ profileId: profile.id, manual: false, screen, assess }, context());
    vi.unstubAllGlobals();
    expect(stats).toMatchObject({ fetched: 1, screened: 1, assessed: 1 });
    expect(fake.searches).toBe(0);
    expect(requests[0]).toMatchObject({ method: "POST" });
    expect(requests[0].headers.get("authorization")).toBe("Bearer scraper-secret");
    expect(requests[0].body).toMatchObject({ keywords: "node.js backend", externalSourceId: "my-scraper" });
    expect((await prisma().jobAssessment.findFirstOrThrow({ include: { posting: true } })).posting.externalId).toBe("scr-1");
  });

  it("fails clearly when the external source isn't set up", async () => {
    const profile = await createProfile({ ...profileInput, query: { ...profileInput.query, externalSourceId: "missing" } });
    const stats = await runDiscoveryPipeline({ profileId: profile.id, manual: false }, context());
    expect(stats.message).toContain("missing");
    expect(await prisma().discoveryRun.findFirstOrThrow()).toMatchObject({ status: RunStatus.FAILED });
  });
});

describe("discoveryRunJob and runDueProfiles", () => {
  it("uses the hooks the wiring registered, through the job definition", async () => {
    const profile = await createProfile(profileInput);
    fake.postings = [posting("good")];
    setPipelineHooks({ screen, assess });
    const stats = await discoveryRunJob.run({ profileId: profile.id, manual: true }, context());
    expect(stats).toMatchObject({ screened: 1, assessed: 1 });
    expect(discoveryRunJob.type).toBe("discovery-run");
  });

  it("queues a run per due profile, skipping one that's already queued or running", async () => {
    const { findUnfinishedJobs, startJob } = await import("@/lib/jobs/runner");
    const busy = await createProfile(profileInput);
    const free = await createProfile({ ...profileInput, name: "Free" });
    vi.mocked(findUnfinishedJobs).mockImplementation(async (key: string) => (key === `discovery:${busy.id}` ? [{ id: "job-1", type: "discovery-run", input: {} }] : []));
    const queued = await runDueProfiles(new Date("2026-11-17T08:00:00Z"));
    expect(queued).toEqual([free.id]);
    expect(startJob).toHaveBeenCalledExactlyOnceWith(discoveryRunJob, { profileId: free.id, manual: false }, { key: `discovery:${free.id}` });
  });
});
