import { createHash } from "node:crypto";

import type { JobSearchProfile } from "@/generated/prisma/client";
import { linkKey, postingKey, type FoundPosting } from "@/lib/job-search/search";

import type { ProfileCriteria } from "./profile";

// Stage 1 of the discovery pipeline (master.md §2.4): deterministic
// filtering, no AI. Pure functions, so they run anywhere and test in
// isolation. Every rejection has a stable machine key in
// REJECTION_REASONS, and a run records it, so nothing is discarded
// without a reason (master.md §2.4, Phase 18).

/** The fields of a profile the deterministic filters read. */
export type ProfileWithCriteria = Pick<JobSearchProfile, "remotePreference" | "salaryMin" | "currency" | "startupOnly" | "companySize"> & {
  criteria: ProfileCriteria;
};

/** Why a posting failed stage 1, keyed for the run record and worded for the user. */
export const REJECTION_REASONS = {
  INVALID_DESCRIPTION: "The posting's description is too short to read, or it has no title and company.",
  BLACKLISTED_COMPANY: "The company is on the profile's blacklist.",
  EXCLUDED_KEYWORD: "The title contains a keyword the profile excludes.",
  EXCLUDED_TECH: "The posting asks for a technology the profile excludes.",
  MISSING_REQUIRED_KEYWORD: "The posting is missing a keyword the profile requires.",
  EMPLOYMENT_TYPE_MISMATCH: "The posting's employment type is one the profile doesn't allow.",
  SALARY_BELOW_MINIMUM: "The stated salary is below the profile's minimum.",
  REMOTE_MISMATCH: "The posting's remote arrangement doesn't fit the profile.",
  COMPANY_SIZE_MISMATCH: "The stated company size is outside the profile's range.",
  STARTUP_ONLY_MISMATCH: "The profile wants a startup, and the posting doesn't read like one.",
} as const;
export type RejectionReason = keyof typeof REJECTION_REASONS;

/** The human text for a rejection key; the key itself when it's unknown. */
export const reasonText = (key: string): string => REJECTION_REASONS[key as RejectionReason] ?? key;

export type FilterOutcome = { passed: boolean; reason: string };

const MIN_DESCRIPTION_CHARS = 80;
const STARTUP_MAX_EMPLOYEES = 1000;
const STARTUP_MARKERS = ["fortune 500", "large enterprise", "multinational", "global corporation", "weltkonzern"];

/** Lower case, letters and digits only, accents dropped: "Café GmbH" and "cafe gmbh" are the same. */
const normal = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const isListed = (company: string, list: readonly string[]) => list.map(normal).includes(normal(company));

// How an employment type reads in a posting's own words, matched against the
// profile's list (which uses the sources' names, e.g. "FULL_TIME").
const EMPLOYMENT_PHRASES: readonly { type: string; pattern: RegExp }[] = [
  { type: "FULL_TIME", pattern: /full[- ]time/i },
  { type: "PART_TIME", pattern: /part[- ]time/i },
  { type: "CONTRACT", pattern: /\bcontract(ing)?\b|\bfixed[- ]term\b/i },
  { type: "INTERN", pattern: /\bintern(ships?)?\b|\bworking student\b/i },
  { type: "FREELANCE", pattern: /\bfreelance\w*\b|\bself[- ]employed\b/i },
  { type: "TEMPORARY", pattern: /\btemp(orar(y|ily))?\b/i },
  { type: "APPRENTICE", pattern: /\bapprentice(ships?)?\b/i },
];

/** Whether the types a description states are allowed. Nothing stated, or no list, passes. */
function employmentTypeAllowed(description: string, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  const allowedSet = new Set(allowed.map((entry) => entry.trim().toUpperCase()));
  const stated = EMPLOYMENT_PHRASES.filter(({ pattern }) => pattern.test(description)).map(({ type }) => type);
  if (stated.length === 0) return true;
  return stated.some((type) => allowedSet.has(type));
}

/** Normalizes thousands separators until stable, so "60,000" and "60.000" and "1.234.567" all read whole. */
function normalizeAmounts(salary: string): string {
  let text = salary;
  for (;;) {
    const next = text.replace(/(\d)[.,\u00a0\u202f\s](\d{3})(?!\d)/g, "$1$2");
    if (next === text) return next;
    text = next;
  }
}

/**
 * The top amount in a salary string ("EUR 60,000 - 75,000" → 75000,
 * "45k-60k" → 60000), or null when there's none. Groups of three digits
 * read as thousands, so a European "60.000" isn't 60.
 */
export function parseSalaryTop(salary: string): number | null {
  let top: number | null = null;
  for (const match of normalizeAmounts(salary).matchAll(/(\d+(?:[.,]\d+)?)\s*(k\b)?/gi)) {
    const digits = match[1] ?? "";
    const value = Number(digits.replace(",", ".")) * (match[2] ? 1000 : 1);
    if (Number.isFinite(value) && (top === null || value > top)) top = value;
  }
  return top;
}

const HOURLY_SALARY = /per hour|hourly|\/\s?h(?:our)?\b|\bstd\.?\b|stundenlohn|pro stunde/i;
const CURRENCY_HINTS: readonly { code: string; pattern: RegExp }[] = [
  { code: "EUR", pattern: /€|\beur\b/i },
  { code: "USD", pattern: /\$|\busd\b/i },
  { code: "GBP", pattern: /£|\bgbp\b/i },
  { code: "CHF", pattern: /\bchf\b/i },
];

/** Whether the posting's salary can be read and sits below the profile's minimum. An hourly wage or another currency is left to the AI stages. */
function salaryBelowMinimum(salary: string, minimum: number | null, profileCurrency: string): boolean {
  if (minimum === null || salary.trim() === "") return false;
  if (HOURLY_SALARY.test(salary)) return false;
  const stated = CURRENCY_HINTS.find(({ pattern }) => pattern.test(salary));
  // Without conversion rates, only the profile's own currency can be compared.
  if (profileCurrency && stated && stated.code !== profileCurrency.trim().toUpperCase()) return false;
  const top = parseSalaryTop(salary);
  return top !== null && top < minimum;
}

/** The employee count a description states ("2,000+ employees", "über 500 Mitarbeiter"), or null when it doesn't say. */
export function statedEmployees(description: string): number | null {
  const match = description.match(/([\d.,\u00a0\u202f\s]{1,15})\s*\+?\s*(?:employees|mitarbeiter)/i);
  if (!match) return null;
  const value = Number(normalizeAmounts(match[1] ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The profile's companySize ("50-200" or "200") as a range, or null when it doesn't parse. */
export function companySizeRange(companySize: string): [number, number] | null {
  const match = companySize.trim().match(/^(\d+)\s*[-–]\s*(\d+)$|^(\d+)$/);
  if (!match) return null;
  if (match[3]) return [Number(match[3]), Number(match[3])];
  return [Number(match[1]), Number(match[2])];
}

function sizeMismatch(stated: number | null, companySize: string): boolean {
  const range = companySizeRange(companySize);
  if (stated === null || !range) return false;
  return stated < range[0] || stated > range[1];
}

function remoteMismatch(remote: boolean | null, preference: string): boolean {
  if (preference === "REMOTE_ONLY") return remote === false;
  if (preference === "ONSITE_OK") return remote === true;
  return false;
}

/**
 * Stage 1: every check master.md §2.4 lists, in order, first failure wins.
 * A whitelisted company bypasses the exclusions (blacklist, excluded
 * keywords and tech) but never the salary floor.
 */
export function deterministicFilter(posting: FoundPosting, profile: ProfileWithCriteria): FilterOutcome {
  const criteria = profile.criteria;
  // Expired or unusable postings first: nothing below can read them.
  if (posting.description.trim().length < MIN_DESCRIPTION_CHARS || !posting.title.trim() || !posting.company.trim()) {
    return { passed: false, reason: "INVALID_DESCRIPTION" };
  }
  const title = posting.title.toLocaleLowerCase();
  const text = `${title} ${posting.description.toLocaleLowerCase()}`;
  const whitelisted = isListed(posting.company, criteria.companyWhitelist);
  if (!whitelisted && isListed(posting.company, criteria.companyBlacklist)) return { passed: false, reason: "BLACKLISTED_COMPANY" };
  // Substring matches keep their punctuation: "Node.js" must still find "Node.js".
  if (!whitelisted && criteria.excludedKeywords.some((keyword) => title.includes(keyword.toLocaleLowerCase()))) return { passed: false, reason: "EXCLUDED_KEYWORD" };
  if (!whitelisted && criteria.excludedTech.some((tech) => text.includes(tech.toLocaleLowerCase()))) return { passed: false, reason: "EXCLUDED_TECH" };
  if (criteria.requiredKeywords.length > 0) {
    const missing = criteria.requiredKeywords.find((keyword) => !text.includes(keyword.toLocaleLowerCase()));
    if (missing) return { passed: false, reason: "MISSING_REQUIRED_KEYWORD" };
  }
  if (!employmentTypeAllowed(posting.description, criteria.employmentTypes)) return { passed: false, reason: "EMPLOYMENT_TYPE_MISMATCH" };
  if (salaryBelowMinimum(posting.salary, profile.salaryMin, profile.currency)) return { passed: false, reason: "SALARY_BELOW_MINIMUM" };
  if (remoteMismatch(posting.remote, profile.remotePreference)) return { passed: false, reason: "REMOTE_MISMATCH" };
  const stated = statedEmployees(posting.description);
  if (sizeMismatch(stated, profile.companySize)) return { passed: false, reason: "COMPANY_SIZE_MISMATCH" };
  if (profile.startupOnly && ((stated !== null && stated >= STARTUP_MAX_EMPLOYEES) || STARTUP_MARKERS.some((marker) => text.includes(marker)))) {
    return { passed: false, reason: "STARTUP_ONLY_MISMATCH" };
  }
  return { passed: true, reason: "" };
}

// ─── Dedupe (master.md §2.3 step 4) ─────────────────────────────────────────

/**
 * The discovery dedupe key, after the agent's idea (agentDedupeKey in
 * src/lib/agent/candidates.ts): a hash of the link without tracking
 * parameters, else of company, title and place, so the same job found
 * through another source or with another id matches. A posting with none
 * of those falls back to its source's id.
 */
export function discoveryKey(posting: Pick<FoundPosting, "source" | "externalId" | "url" | "title" | "company" | "place">): string {
  const link = linkKey(posting.url);
  const facts = [posting.company, posting.title, posting.place].map(normal);
  const basis = link ? `link:${link}` : facts.some(Boolean) ? `job:${facts.join("|")}` : `id:${posting.source}:${posting.externalId}`;
  return createHash("sha256").update(basis).digest("hex");
}

export type DuplicateFinderResult = { fresh: FoundPosting[]; duplicates: FoundPosting[] };

/**
 * Splits a page into postings worth processing and ones seen already:
 * within the page, and against `knownKeys` (the postingKeys of postings
 * any earlier run assessed). Either key catches a repeat later in the
 * same page too.
 */
export function duplicateFinder(postings: readonly FoundPosting[], knownKeys: readonly string[] = []): DuplicateFinderResult {
  const seen = new Set(knownKeys);
  const fresh: FoundPosting[] = [];
  const duplicates: FoundPosting[] = [];
  for (const posting of postings) {
    const key = postingKey(posting);
    const dedupe = discoveryKey(posting);
    if (seen.has(key) || seen.has(dedupe)) duplicates.push(posting);
    else fresh.push(posting);
    seen.add(key);
    seen.add(dedupe);
  }
  return { fresh, duplicates };
}
