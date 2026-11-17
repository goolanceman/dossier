import "server-only";

import { z } from "zod";

import { foundPostingSchema, type FoundPosting, type SearchPage, type SearchQuery } from "@/lib/job-search/search";
import { logServerWarning } from "@/lib/log";
import { prisma } from "@/lib/prisma";

// External job sources (master.md §2.1): the user's own remote scraper and
// Apify actors, beside the built-in adapters (src/lib/job-search). Each
// source answers with postings in the shared shape, normalized with
// foundPostingSchema; entries that don't fit are dropped and counted.

export type ExternalSearchOptions = {
  signal?: AbortSignal;
  /** At most this many postings. */
  maxResults?: number;
  /** The page to ask for, as the previous answer's `next` named it. */
  next?: string | null;
};

/** What a pluggable source can do: search, and optionally fetch a posting's whole text. */
export interface ExternalSource {
  id: string;
  label: string;
  search(query: SearchQuery, options: ExternalSearchOptions): Promise<SearchPage>;
  /** The posting's full text, or null when the source can't fetch it separately. */
  fetchDetails?(posting: FoundPosting): Promise<string | null>;
}

// ─── SSRF guard ──────────────────────────────────────────────────────────────

const PRIVATE_V4 = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const PRIVATE_V6 = /^(::1$|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/;

/**
 * The address a source may be asked: http(s) only, no credentials in the
 * URL, and never a loopback or private IP literal (or a shorthand like
 * "127.1"), which could turn a saved scraper into a probe of the
 * server's own network. A host with no dot resolves inside the network
 * or nowhere, so it's refused too. null when the address isn't safe.
 */
export function safeExternalUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^\d{1,3}(\.\d{1,3}){1,3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (parts.some((part) => part > 255)) return null;
    // Shorthand like "127.1" means 127.0.0.1, so only four-part addresses may pass.
    if (parts.length !== 4 || PRIVATE_V4.test(host)) return null;
    return url;
  }
  if (host.includes(":")) return PRIVATE_V6.test(host) ? null : url;
  if (!host.includes(".")) return null;
  return url;
}

// ─── Requests ────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000;
const APIFY_TIMEOUT_MS = 120_000;
const MAX_BYTES = 5 * 1024 * 1024;

/** The body as text, or null when it's bigger than `limit` bytes (as src/lib/job-search/http.ts reads its answers). */
async function readLimited(response: Response, limit: number): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Posts JSON and reads the JSON answer; every failure comes back as an Error worded for the user. */
async function requestJson(url: URL, init: RequestInit, { signal, timeoutMs = REQUEST_TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: "no-store" });
  } catch {
    throw new Error("The source isn't answering right now. Try again in a minute.");
  }
  if (!response.ok) throw new Error(`The source answered with HTTP ${response.status}.`);
  const text = await readLimited(response, MAX_BYTES);
  if (text === null) throw new Error("The source's answer was too large to read.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("The source's answer wasn't JSON; its service may have changed.");
  }
}

// ─── Normalizing ─────────────────────────────────────────────────────────────

/**
 * Normalizes source entries with the shared posting schema; entries that
 * don't fit are dropped and counted, never guessed into shape.
 */
export function normalizeExternalPostings(items: readonly unknown[]): { postings: FoundPosting[]; dropped: number } {
  const postings: FoundPosting[] = [];
  let dropped = 0;
  for (const item of items) {
    const result = foundPostingSchema.safeParse(item);
    if (result.success) postings.push(result.data);
    else dropped += 1;
  }
  return { postings, dropped };
}

const logDropped = (label: string, dropped: number) => {
  if (dropped > 0) logServerWarning("discovery", `${label} returned ${dropped} entries that didn't fit a posting; they were dropped.`);
};

// ─── HTTP scraper ────────────────────────────────────────────────────────────

export type HttpScraperConfig = { id: string; label: string; url: string; token?: string };

/**
 * The user's own remote scraper, over HTTP. The JSON contract:
 *
 *   Request   POST <url>, header `authorization: Bearer <token>` when a
 *             token is saved, body { keywords, place, country, radiusKm,
 *             remoteOnly, postedWithin, maxResults, next } (next: null on
 *             the first page).
 *   Response  { postings: [ { source, externalId, title, company, place,
 *               remote, salary, postedAt, url, via, description,
 *               complete }, ... ], next: "cursor" | null }
 *             or a bare array of the same entries.
 *
 * `source` must name one of the built-in sources (where the posting was
 * scraped from), so a posting keeps its unique key across runs.
 */
export function httpScraperSource(config: HttpScraperConfig): ExternalSource {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.token) headers.authorization = `Bearer ${config.token}`;
  return {
    id: config.id,
    label: config.label,
    async search(query, options) {
      const url = safeExternalUrl(config.url);
      if (!url) throw new Error("The scraper's address isn't a public web address. Check it in the discovery sources.");
      const answer = await requestJson(
        url,
        { method: "POST", headers, body: JSON.stringify({ ...query, maxResults: options.maxResults ?? 50, next: options.next ?? null }) },
        { signal: options.signal },
      );
      const items = Array.isArray(answer) ? answer : typeof answer === "object" && answer !== null && Array.isArray((answer as { postings?: unknown }).postings) ? ((answer as { postings: unknown[] }).postings) : [];
      const { postings, dropped } = normalizeExternalPostings(items);
      logDropped(config.label, dropped);
      const next = typeof answer === "object" && answer !== null && typeof (answer as { next?: unknown }).next === "string" ? ((answer as { next: string }).next) : null;
      return { postings, next };
    },
    async fetchDetails(posting) {
      try {
        const url = safeExternalUrl(config.url);
        if (!url) return null;
        const answer = await requestJson(url, { method: "POST", headers, body: JSON.stringify({ details: { source: posting.source, externalId: posting.externalId, url: posting.url } }) }, { signal: undefined });
        const description = (answer as { description?: unknown }).description;
        return typeof description === "string" && description.trim() !== "" ? description : null;
      } catch {
        return null;
      }
    },
  };
}

// ─── Apify ───────────────────────────────────────────────────────────────────

export type ApifyConfig = { id: string; label: string; token: string; actorId: string };

const firstString = (raw: Record<string, unknown>, keys: readonly string[]): string =>
  keys.map((key) => raw[key]).find((value): value is string => typeof value === "string" && value.trim() !== "") ?? "";

/** An epoch or ISO date as the ISO string a posting wants, or null. */
function isoOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Maps one dataset item to the shape a posting normalizes from, leniently: actors name their fields differently. */
function itemOf(item: unknown, label: string): unknown {
  if (typeof item !== "object" || item === null) return item;
  const raw = item as Record<string, unknown>;
  const description = firstString(raw, ["description", "descriptionText", "snippet", "text", "body"]);
  return {
    source: firstString(raw, ["source", "platform", "site"]),
    externalId: firstString(raw, ["externalId", "id", "jobId", "guid"]) || firstString(raw, ["url", "jobUrl", "link"]),
    title: firstString(raw, ["title", "position", "jobTitle", "name"]),
    company: firstString(raw, ["company", "organization", "companyName", "employer"]),
    place: firstString(raw, ["place", "location", "jobLocation", "city"]),
    remote: typeof raw.remote === "boolean" ? raw.remote : typeof raw.isRemote === "boolean" ? raw.isRemote : null,
    salary: firstString(raw, ["salary", "salaryString", "compensation"]),
    postedAt: isoOf(raw.postedAt ?? raw.publishedAt ?? raw.postedDate ?? raw.createdAt),
    url: firstString(raw, ["url", "jobUrl", "link", "applyUrl"]),
    via: firstString(raw, ["via"]) || label,
    description,
    complete: raw.complete === true || description !== "",
  };
}

/**
 * An Apify actor, through run-sync-get-dataset: the run input carries the
 * search, the answer is the dataset's items. Mapped leniently and then
 * normalized like every other source.
 */
export function apifySource(config: ApifyConfig): ExternalSource {
  return {
    id: config.id,
    label: config.label,
    async search(query, options) {
      const url = new URL(`https://api.apify.com/v2/acts/${encodeURIComponent(config.actorId)}/run-sync-get-dataset`);
      url.searchParams.set("token", config.token);
      const body = {
        keywords: query.keywords,
        place: query.place,
        country: query.country,
        radiusKm: query.radiusKm,
        remoteOnly: query.remoteOnly,
        postedWithin: query.postedWithin,
        maxResults: options.maxResults ?? 50,
        next: options.next ?? null,
      };
      const answer = await requestJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, { signal: options.signal, timeoutMs: APIFY_TIMEOUT_MS });
      const items = Array.isArray(answer) ? answer : [];
      const { postings, dropped } = normalizeExternalPostings(items.map((item) => itemOf(item, config.label)));
      logDropped(config.label, dropped);
      return { postings, next: null };
    },
  };
}

// ─── Saved sources (Setting rows, the existing kv pattern) ───────────────────

export const EXTERNAL_SOURCE_PREFIX = "discovery:external:";

export const externalSourceSettingSchema = z.object({
  id: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/),
  kind: z.enum(["HTTP_SCRAPER", "APIFY"]),
  url: z.string().trim().max(2000).default(""),
  token: z.string().trim().max(2000).default(""),
  actorId: z.string().trim().max(200).default(""),
  label: z.string().trim().min(1).max(200),
  enabled: z.boolean().default(true),
});
export type ExternalSourceSetting = z.output<typeof externalSourceSettingSchema>;

/** The saved sources that are on, as ready adapters. Tokens stay in here, server-side. */
export async function loadExternalSources(): Promise<ExternalSource[]> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: EXTERNAL_SOURCE_PREFIX } } });
  const sources: ExternalSource[] = [];
  for (const row of rows) {
    let value: unknown;
    try {
      value = JSON.parse(row.value);
    } catch {
      logServerWarning("discovery", `A saved external source (${row.key}) isn't valid JSON and was skipped.`);
      continue;
    }
    const parsed = externalSourceSettingSchema.safeParse(value);
    if (!parsed.success) {
      logServerWarning("discovery", `A saved external source (${row.key}) is missing fields and was skipped.`);
      continue;
    }
    const config = parsed.data;
    if (!config.enabled) continue;
    if (config.kind === "APIFY") {
      if (!config.token || !config.actorId) continue;
      sources.push(apifySource({ id: config.id, label: config.label, token: config.token, actorId: config.actorId }));
    } else {
      if (!config.url) continue;
      sources.push(httpScraperSource({ id: config.id, label: config.label, url: config.url, token: config.token || undefined }));
    }
  }
  return sources;
}

/** What a list of sources may show: everything but the tokens. */
export type ExternalSourceView = { id: string; kind: "HTTP_SCRAPER" | "APIFY"; label: string; enabled: boolean; url: string; hasToken: boolean; hasActor: boolean };

export async function listExternalSourceSettings(): Promise<ExternalSourceView[]> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: EXTERNAL_SOURCE_PREFIX } }, orderBy: { key: "asc" } });
  const views: ExternalSourceView[] = [];
  for (const row of rows) {
    try {
      const parsed = externalSourceSettingSchema.safeParse(JSON.parse(row.value));
      if (!parsed.success) continue;
      const config = parsed.data;
      views.push({ id: config.id, kind: config.kind, label: config.label, enabled: config.enabled, url: config.url, hasToken: config.token !== "", hasActor: config.actorId !== "" });
    } catch {
      continue;
    }
  }
  return views;
}
