import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { JobStatus, RunStatus } from "@/generated/prisma/enums";
import { listExternalSourceSettings } from "@/lib/discovery/external";
import { createTestClient, resetDatabase } from "@/test/db";

import { deleteExternalSource, deleteSearchProfile, runProfileNow, saveExternalSource, saveSearchProfile, setProfileEnabled } from "./actions";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "x".repeat(32) } }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ persistent: false, issuedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The AI provider and the source's key: the Run now gate reads both.
const setup = vi.hoisted(() => ({ ai: true, key: true }));
vi.mock("@/lib/ai/config", () => ({
  isAiConfigured: async () => setup.ai,
  loadAiConfig: async () => ({ provider: "LOCAL", baseUrl: "http://localhost:11434", model: null, apiKey: null, apiKeyProblem: null, timeoutMs: 1000 }),
}));
vi.mock("@/lib/job-search/config", async () => {
  const { jobSearchError } = await import("@/lib/job-search/errors");
  return {
    loadJobSearchConfig: async () => ({
      source: "JSEARCH",
      saved: true,
      jsearch: { key: setup.key ? "jsearch-key" : null, host: "openwebninja", keyState: setup.key ? "set" : "none" },
      adzuna: { appId: "app", key: setup.key ? "adzuna-key" : null, keyState: setup.key ? "set" : "none" },
      arbeitsagentur: { offered: true, acceptedAt: "2026-01-01T00:00:00.000Z" },
      freehire: { url: "https://freehire.me" },
    }),
    credentialsFor: (config: { jsearch: { key: string | null } }, source: "JSEARCH" | "ADZUNA") => {
      const key = source === "JSEARCH" ? config.jsearch.key : setup.key ? "adzuna-key" : null;
      if (!key) throw jobSearchError("no-key", source);
      return { key, host: "openwebninja" };
    },
    requestContext: () => ({}),
  };
});
// The pipeline's fetch: here it answers with nothing, so a run finishes empty and done.
vi.mock("@/lib/job-search", () => ({ searchPostings: vi.fn(async () => ({ postings: [], next: null })) }));

const prisma = () => db.client!;

const profileInput = {
  name: "Senior Node.js Backend Engineer",
  source: "JSEARCH" as const,
  query: { keywords: "node.js backend", place: "Berlin", country: "de", radiusKm: 50 as const, remoteOnly: false, postedWithin: "week" as const, skipStages: [] },
  criteria: {
    titles: ["Senior Backend Engineer"],
    altTitles: [],
    requiredKeywords: [],
    excludedKeywords: ["PHP"],
    requiredTech: ["Node.js"],
    preferredTech: [],
    excludedTech: [],
    seniority: [],
    employmentTypes: [],
    remoteCountries: [],
    companyBlacklist: [],
    companyWhitelist: [],
    industries: [],
  },
  salaryMin: 60000,
  scheduleKind: "HOURLY" as const,
  maxJobsPerRun: 10,
  enabled: true,
};

/** A row straight in the database, bypassing the action: what its tests vary is the query. */
const createRow = async (query: Prisma.InputJsonValue = profileInput.query) =>
  prisma().jobSearchProfile.create({
    data: {
      name: profileInput.name,
      source: "JSEARCH",
      query,
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
      scheduleKind: "HOURLY",
      salaryMin: 60000,
    },
    select: { id: true },
  });

beforeEach(async () => {
  Object.assign(setup, { ai: true, key: true });
  await resetDatabase(prisma());
});
afterAll(() => prisma().$disconnect());

describe("the profile actions (master.md §2.2)", () => {
  it("creates a profile through saveSearchProfile, an empty time zone being the server's", async () => {
    expect(await saveSearchProfile({ profile: profileInput })).toMatchObject({ ok: true });
    const row = await prisma().jobSearchProfile.findFirstOrThrow();
    expect(row).toMatchObject({ name: "Senior Node.js Backend Engineer", source: "JSEARCH", salaryMin: 60000, maxJobsPerRun: 10 });
    expect(row.titles).toEqual(["Senior Backend Engineer"]);

    await saveSearchProfile({ profile: { ...profileInput, name: "No zone", timeZone: "" } });
    expect((await prisma().jobSearchProfile.findFirstOrThrow({ where: { name: "No zone" } })).timeZone).toBe("");
  });

  it("rewrites a profile by id, and says when it's gone", async () => {
    const created = await createRow();
    expect(await saveSearchProfile({ id: created.id, profile: { ...profileInput, name: "Renamed" } })).toMatchObject({ ok: true });
    expect((await prisma().jobSearchProfile.findUniqueOrThrow({ where: { id: created.id } })).name).toBe("Renamed");
    expect(await saveSearchProfile({ id: "nope", profile: profileInput })).toMatchObject({ ok: false, error: "That profile is gone. It may have been deleted already." });
  });

  it("turns validation into an ActionError message, before anything is written", async () => {
    const result = await saveSearchProfile({ profile: { ...profileInput, maxJobsPerRun: 0 } });
    expect(result).toMatchObject({ ok: false, error: expect.any(String) });
    expect(await prisma().jobSearchProfile.count()).toBe(0);

    const cron = await saveSearchProfile({ profile: { ...profileInput, scheduleKind: "CRON" as const, cron: "" } });
    expect(cron).toMatchObject({ ok: false, error: "A CRON schedule needs a cron expression." });
  });

  it("toggles a profile, and deletes it", async () => {
    const created = await createRow();
    expect(await setProfileEnabled({ id: created.id, enabled: false })).toMatchObject({ ok: true });
    expect((await prisma().jobSearchProfile.findUniqueOrThrow({ where: { id: created.id } })).enabled).toBe(false);
    expect(await setProfileEnabled({ id: "nope", enabled: true })).toMatchObject({ ok: false });

    expect(await deleteSearchProfile({ id: created.id })).toMatchObject({ ok: true });
    expect(await prisma().jobSearchProfile.count()).toBe(0);
    expect(await deleteSearchProfile({ id: created.id })).toMatchObject({ ok: false });
  });
});

describe("Run now (master.md §2.3)", () => {
  it("queues a discovery-run job for the profile, keyed so the schedule finds it", async () => {
    const created = await createRow();
    const result = await runProfileNow({ id: created.id });
    expect(result).toMatchObject({ ok: true, data: { reused: false } });
    if (!result.ok) throw new Error("not ok");
    const job = await prisma().job.findUniqueOrThrow({ where: { id: result.data.jobId } });
    expect(job).toMatchObject({ type: "discovery-run", key: `discovery:${created.id}`, input: { profileId: created.id, manual: true } });

    // The job runs in this process: the run row ends done, and lastRunAt moves.
    const finished = await vi.waitFor(
      async () => {
        const row = await prisma().job.findUniqueOrThrow({ where: { id: job.id } });
        if (row.status !== JobStatus.DONE && row.status !== JobStatus.FAILED) throw new Error("not finished");
        return row;
      },
      { timeout: 15_000 },
    );
    expect(finished.status).toBe(JobStatus.DONE);
    expect(await prisma().discoveryRun.findFirstOrThrow()).toMatchObject({ profileId: created.id, status: RunStatus.DONE });
    expect((await prisma().jobSearchProfile.findUniqueOrThrow({ where: { id: created.id } })).lastRunAt).toBeInstanceOf(Date);
  });

  it("reuses a run that's already queued", async () => {
    const created = await createRow();
    const queued = await prisma().job.create({ data: { type: "discovery-run", key: `discovery:${created.id}`, status: JobStatus.QUEUED, input: { profileId: created.id, manual: false } } });
    expect(await runProfileNow({ id: created.id })).toEqual({ ok: true, data: { jobId: queued.id, reused: true } });
    expect(await prisma().job.count()).toBe(1);
  });

  it("says what's missing before it starts: the AI provider, the key, the external source", async () => {
    const created = await createRow();
    setup.ai = false;
    expect(await runProfileNow({ id: created.id })).toMatchObject({ ok: false, error: "Choose an AI provider in Settings → AI provider first." });
    setup.ai = true;
    setup.key = false;
    expect(await runProfileNow({ id: created.id })).toMatchObject({ ok: false, error: "Add your JSearch key in Settings → Job search first." });
    setup.key = true;

    await prisma().jobSearchProfile.update({ where: { id: created.id }, data: { query: { ...profileInput.query, externalSourceId: "my-scraper" } } });
    expect(await runProfileNow({ id: created.id })).toMatchObject({ ok: false, error: 'The external source "my-scraper" isn\'t set up or is off.' });
    await saveExternalSource({ id: "my-scraper", kind: "HTTP_SCRAPER", url: "https://scraper.example.com/jobs", label: "My scraper", enabled: true });
    expect(await runProfileNow({ id: created.id })).toMatchObject({ ok: true });
  });
});

describe("the external sources (master.md §2.1)", () => {
  it("saves a scraper as a Setting row, and keeps the saved token when none is sent", async () => {
    expect(await saveExternalSource({ id: "my-scraper", kind: "HTTP_SCRAPER", url: "https://scraper.example.com/jobs", token: "tok-1", label: "My scraper", enabled: true })).toMatchObject({ ok: true });
    const row = await prisma().setting.findUniqueOrThrow({ where: { key: "discovery:external:my-scraper" } });
    expect(JSON.parse(row.value)).toMatchObject({ id: "my-scraper", kind: "HTTP_SCRAPER", url: "https://scraper.example.com/jobs", token: "tok-1", label: "My scraper", enabled: true });

    expect(await saveExternalSource({ id: "my-scraper", kind: "HTTP_SCRAPER", url: "https://scraper.example.com/jobs", token: "", label: "My scraper", enabled: false })).toMatchObject({ ok: true });
    const again = JSON.parse((await prisma().setting.findUniqueOrThrow({ where: { key: "discovery:external:my-scraper" } })).value);
    expect(again).toMatchObject({ token: "tok-1", enabled: false });

    expect(await listExternalSourceSettings()).toEqual([expect.objectContaining({ id: "my-scraper", hasToken: true, enabled: false })]);
  });

  it("refuses what isn't a public web address, and an Apify source without its token", async () => {
    expect(await saveExternalSource({ id: "loopback", kind: "HTTP_SCRAPER", url: "http://127.0.0.1:8080/jobs", label: "Loopback", enabled: true })).toMatchObject({
      ok: false,
      error: "The scraper's address isn't a public web address. Check it in the discovery sources.",
    });
    expect(await prisma().setting.count()).toBe(0);

    expect(await saveExternalSource({ id: "apify-one", kind: "APIFY", actorId: "someone~my-scraper", label: "Apify one", enabled: true })).toMatchObject({ ok: false, error: "Give the Apify token." });
    expect(await prisma().setting.count()).toBe(0);
  });

  it("removes the Setting row", async () => {
    await saveExternalSource({ id: "my-scraper", kind: "HTTP_SCRAPER", url: "https://scraper.example.com/jobs", label: "My scraper", enabled: true });
    expect(await deleteExternalSource({ id: "my-scraper" })).toMatchObject({ ok: true });
    expect(await prisma().setting.count()).toBe(0);
    expect(await deleteExternalSource({ id: "my-scraper" })).toMatchObject({ ok: true });
  });
});
