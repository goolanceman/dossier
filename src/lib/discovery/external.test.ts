import { afterEach, describe, expect, it, vi } from "vitest";

import { json, stubFetch } from "@/lib/ai/test-http";

import { apifySource, httpScraperSource, listExternalSourceSettings, loadExternalSources, normalizeExternalPostings, safeExternalUrl } from "./external";

// The Setting rows loadExternalSources reads.
const db = vi.hoisted(() => ({ rows: [] as { key: string; value: string }[] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: {
      findMany: vi.fn(async () => db.rows),
    },
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  db.rows = [];
});

const validEntry = {
  source: "ADZUNA",
  externalId: "scr-1",
  title: "Backend Engineer",
  company: "Remote Co",
  place: "Remote",
  remote: true,
  salary: "",
  postedAt: "2026-11-16T08:00:00.000Z",
  url: "https://jobs.example/scr-1",
  via: "",
  description: "A whole posting's text.",
  complete: true,
};

describe("safeExternalUrl", () => {
  it("lets public web addresses through", () => {
    expect(safeExternalUrl("https://scraper.example.com/jobs")?.host).toBe("scraper.example.com");
    expect(safeExternalUrl("http://scraper.example.com")?.protocol).toBe("http:");
  });

  it("refuses what isn't a public web address", () => {
    for (const bad of [
      "ftp://scraper.example.com",
      "file:///etc/passwd",
      "https://localhost/jobs",
      "https://scraper.localhost",
      "https://scraper.local",
      "https://scraper.internal",
      "http://127.0.0.1/jobs",
      "http://10.1.2.3/jobs",
      "http://172.16.0.1/jobs",
      "http://172.31.255.255/jobs",
      "http://192.168.1.10/jobs",
      "http://0.0.0.0/jobs",
      "http://169.254.1.1/jobs",
      "http://127.1/jobs",
      "http://[::1]/jobs",
      "http://[fd00::1]/jobs",
      "http://[fe80::1]/jobs",
      "https://intranet/jobs",
      "https://user:secret@example.com/jobs",
      "not a url",
      "",
    ]) {
      expect(safeExternalUrl(bad)).toBeNull();
    }
    // The broadcast range next door is public.
    expect(safeExternalUrl("http://172.32.0.1/jobs")).not.toBeNull();
  });
});

describe("normalizeExternalPostings", () => {
  it("keeps what fits a posting and counts the rest", () => {
    const { postings, dropped } = normalizeExternalPostings([validEntry, { ...validEntry, source: "LINKEDIN" }, { ...validEntry, externalId: "" }, "not an entry"]);
    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({ source: "ADZUNA", externalId: "scr-1" });
    expect(dropped).toBe(3);
  });
});

describe("httpScraperSource", () => {
  const config = { id: "my-scraper", label: "My scraper", url: "https://scraper.example.com/jobs", token: "scraper-secret" };

  it("posts the search and reads the answer's shape", async () => {
    const requests = stubFetch(() => json({ postings: [validEntry, { broken: true }], next: "cursor-2" }));
    const page = await httpScraperSource(config).search(
      { keywords: "backend", place: "Berlin", country: "de", radiusKm: 50, remoteOnly: false, postedWithin: "week" },
      { maxResults: 25 },
    );
    expect(page).toMatchObject({ next: "cursor-2" });
    expect(page.postings).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "POST" });
    expect(requests[0].headers.get("authorization")).toBe("Bearer scraper-secret");
    expect(requests[0].headers.get("content-type")).toBe("application/json");
    expect(requests[0].body).toMatchObject({ keywords: "backend", country: "de", maxResults: 25, next: null });
  });

  it("accepts a bare array, and pages with the cursor it was given", async () => {
    const requests = stubFetch(() => json([validEntry]));
    const page = await httpScraperSource(config).search(
      { keywords: "backend", place: "", country: "de", radiusKm: 25, remoteOnly: false, postedWithin: "any" },
      { next: "cursor-2" },
    );
    expect(page.postings).toHaveLength(1);
    expect(page.next).toBeNull();
    expect(requests[0].body).toMatchObject({ next: "cursor-2" });
  });

  it("refuses an unsafe address and a broken answer", async () => {
    await expect(httpScraperSource({ ...config, url: "http://127.0.0.1/jobs" }).search(
      { keywords: "", place: "", country: "", radiusKm: 25, remoteOnly: false, postedWithin: "any" },
      {},
    )).rejects.toThrow("isn't a public web address");
    stubFetch(() => json({ nope: true }, { status: 500 }));
    await expect(httpScraperSource(config).search(
      { keywords: "", place: "", country: "", radiusKm: 25, remoteOnly: false, postedWithin: "any" },
      {},
    )).rejects.toThrow("HTTP 500");
  });

  it("fetches details, and gives up quietly when it can't", async () => {
    const requests = stubFetch(() => json({ description: "The whole text." }));
    const source = httpScraperSource(config);
    expect(await source.fetchDetails!({ ...validEntry, source: "ADZUNA" } as never)).toBe("The whole text.");
    expect(requests[0].body).toMatchObject({ details: { source: "ADZUNA", externalId: "scr-1" } });
    stubFetch(() => json({}, { status: 503 }));
    expect(await source.fetchDetails!({ ...validEntry, source: "ADZUNA" } as never)).toBeNull();
  });
});

describe("apifySource", () => {
  const config = { id: "apify", label: "Apify boards", token: "apify-token", actorId: "some-owner~jobs-actor" };

  it("calls run-sync-get-dataset and maps dataset items leniently", async () => {
    const requests = stubFetch(() =>
      json([
        { position: "Developer", organization: "GmbH Co", jobUrl: "https://jobs.example/1", descriptionText: "A whole posting's text.", id: "1", source: "JSEARCH" },
        { title: "No source named", externalId: "2", url: "https://jobs.example/2", description: "Text." },
        { title: "Foreign board", externalId: "3", source: "SOMEBOARD", description: "Text." },
      ]),
    );
    const page = await apifySource(config).search(
      { keywords: "backend", place: "Berlin", country: "de", radiusKm: 25, remoteOnly: false, postedWithin: "month" },
      { maxResults: 10 },
    );
    expect(page.postings).toHaveLength(1);
    expect(page.postings[0]).toMatchObject({ source: "JSEARCH", externalId: "1", title: "Developer", company: "GmbH Co", url: "https://jobs.example/1", via: "Apify boards", complete: true });
    expect(requests[0].url.host).toBe("api.apify.com");
    expect(requests[0].url.pathname).toContain("/v2/acts/some-owner~jobs-actor/run-sync-get-dataset");
    expect(requests[0].url.searchParams.get("token")).toBe("apify-token");
    expect(requests[0].body).toMatchObject({ keywords: "backend", country: "de", maxResults: 10 });
  });

  it("reads dates as ISO strings or epochs", async () => {
    const requests = stubFetch(() =>
      json([
        { title: "A", externalId: "1", source: "JSEARCH", description: "Text.", publishedAt: 1_700_000_000 },
        { title: "B", externalId: "2", source: "JSEARCH", description: "Text.", postedAt: "2026-11-16T08:00:00Z" },
      ]),
    );
    const page = await apifySource(config).search({ keywords: "", place: "", country: "", radiusKm: 25, remoteOnly: false, postedWithin: "any" }, {});
    expect(page.postings.map((posting) => posting.postedAt)).toEqual([new Date(1_700_000_000_000).toISOString(), "2026-11-16T08:00:00.000Z"]);
    expect(requests).toHaveLength(1);
  });
});

describe("loadExternalSources", () => {
  const setting = (id: string, value: unknown) => ({ key: `discovery:external:${id}`, value: JSON.stringify(value) });

  it("builds adapters for the enabled sources and skips the rest", async () => {
    db.rows = [
      setting("scraper", { id: "scraper", kind: "HTTP_SCRAPER", url: "https://scraper.example.com/jobs", token: "scraper-secret", label: "My scraper", enabled: true }),
      setting("off", { id: "off", kind: "HTTP_SCRAPER", url: "https://off.example.com", label: "Off", enabled: false }),
      { key: "discovery:external:broken", value: "{not json" },
      setting("incomplete", { id: "incomplete", kind: "HTTP_SCRAPER", label: "No url" }),
      setting("apify", { id: "apify", kind: "APIFY", token: "apify-token", actorId: "owner~actor", label: "Apify", enabled: true }),
      setting("apify-incomplete", { id: "apify-incomplete", kind: "APIFY", label: "No token" }),
    ];
    const sources = await loadExternalSources();
    expect(sources.map((source) => source.id).sort()).toEqual(["apify", "scraper"]);
    expect(sources.find((source) => source.id === "scraper")?.label).toBe("My scraper");
  });

  it("lists sources for the screen without their tokens", async () => {
    db.rows = [
      // As the query orders them: by key.
      setting("apify", { id: "apify", kind: "APIFY", token: "apify-token", actorId: "owner~actor", label: "Apify", enabled: false }),
      setting("scraper", { id: "scraper", kind: "HTTP_SCRAPER", url: "https://scraper.example.com/jobs", token: "scraper-secret", label: "My scraper", enabled: true }),
    ];
    const views = await listExternalSourceSettings();
    expect(views).toEqual([
      { id: "apify", kind: "APIFY", label: "Apify", enabled: false, url: "", hasToken: true, hasActor: true },
      { id: "scraper", kind: "HTTP_SCRAPER", label: "My scraper", enabled: true, url: "https://scraper.example.com/jobs", hasToken: true, hasActor: false },
    ]);
    expect(JSON.stringify(views)).not.toContain("scraper-secret");
    expect(JSON.stringify(views)).not.toContain("apify-token");
  });
});
