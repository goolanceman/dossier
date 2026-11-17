// Parsing the salary text a source gives (Posting.salary), without guessing
// (master.md Phase 4: salary must not be hallucinated). Pure string work,
// shared by the salary estimate service and the mandatory rejection rules.

/** How a figure is counted; unstated reads as annual, the usual for job ads. */
export type SalaryBasis = "ANNUAL" | "MONTHLY" | "HOURLY";

export type ParsedSalary = {
  /** Low end of the range; null when the ad only says "up to X". */
  minimum: number | null;
  /** High end of the range; null when the ad only says "from X". */
  maximum: number | null;
  /** ISO code, e.g. "EUR"; parsing refuses to answer without one. */
  currency: string;
  basis: SalaryBasis;
};

const SYMBOL_CURRENCIES: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP" };

/** Formats where "." groups thousands and "," is decimals (Nordic/PLN ads). */
const DOT_THOUSAND_CURRENCIES = new Set(["SEK", "NOK", "DKK", "PLN"]);

const HOURLY_HINTS = /\b(?:an hour|per hour|hourly|p\/h|hr)\b|\/(?:hour|hr)\b/i;
const MONTHLY_HINTS = /\b(?:a month|per month|monthly|p\/m)\b|\/(?:month|mo)\b/i;

/** The ad caps the pay here rather than stating a range. */
const MAXIMUM_ONLY = /(?:up to|to|max(?:imum)?|less than|under|below|<)\s*$/i;
/** The ad starts the pay here: "from 60,000", "60,000+". */
const MINIMUM_ONLY = /(?:from|min(?:imum)?|over|above|more than|at least|starting at|>)\s*$/i;

/** Between two figures: a dash or "to", with spaces and currency markers around them. */
const stripCurrency = (text: string) => text.replace(/[$€£]|\b(?:EUR|USD|GBP|CHF|SEK|NOK|DKK|PLN)\b/gi, "");
const isRangeSeparator = (text: string) => /^-$/.test(stripCurrency(text).trim()) || /^to$/i.test(stripCurrency(text).trim());

function findCurrency(text: string): string | null {
  const iso = /\b(EUR|USD|GBP|CHF|SEK|NOK|DKK|PLN)\b/i.exec(text);
  if (iso !== null) return iso[1].toUpperCase();
  const symbol = /[$€£]/.exec(text);
  return symbol === null ? null : SYMBOL_CURRENCIES[symbol[0]] ?? null;
}

type Token = { value: number; start: number; end: number; k: boolean };

/**
 * Numbers as the ad writes them: comma thousands ("60,000"), space thousands
 * for the Nordic/PLN formats ("45 000 SEK"), dot thousands for the same
 * ("45.000 PLN"), decimals ("£12.50") and plain digits. `k`/`K` multiplies by
 * 1,000 and is kept on the token so a range like "60-70k" can share it.
 */
function findNumbers(text: string, dotThousands: boolean): Token[] {
  const alternatives = [
    "\\d{1,3}(?:,\\d{3})+",
    "\\d{1,3}(?: \\d{3})+",
    ...(dotThousands ? ["\\d{1,3}(?:\\.\\d{3})+"] : []),
    "\\d+\\.\\d{1,2}",
    "\\d+",
  ];
  const pattern = new RegExp(alternatives.join("|"), "g");
  const tokens: Token[] = [];
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    let value: number;
    if (/[, ]/.test(raw)) value = Number(raw.replace(/[, ]/g, ""));
    else if (dotThousands && /^\d{1,3}(?:\.\d{3})+$/.test(raw)) value = Number(raw.replace(/\./g, ""));
    else value = Number(raw);
    const kSuffix = /^\s*k\b/i.exec(text.slice(match.index + raw.length));
    const k = kSuffix !== null;
    tokens.push({ value, start: match.index, end: match.index + raw.length + (kSuffix?.[0].length ?? 0), k });
  }
  return tokens;
}

/** Applies each token's own `k`, plus the shared one in "60-70k". */
function tokenValues(tokens: Token[]): number[] {
  const shared = tokens.some((token) => token.k);
  return tokens.map((token) => token.value * (token.k || shared ? 1_000 : 1));
}

/**
 * Reads one salary line into a range, currency and basis. Returns null when
 * the text has no parseable figure or no currency: code must never invent
 * either (master.md Phase 4).
 */
export function parseSalaryText(text: string): ParsedSalary | null {
  const normalized = text.replace(/\u00a0/g, " ").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (normalized === "") return null;
  const currency = findCurrency(normalized);
  if (currency === null) return null;
  const tokens = findNumbers(normalized, DOT_THOUSAND_CURRENCIES.has(currency));
  if (tokens.length === 0) return null;

  let minimum: number | null;
  let maximum: number | null;
  const joinsTwoFigures = tokens.length >= 2 && isRangeSeparator(normalized.slice(tokens[0].end, tokens[1].start));
  if (joinsTwoFigures) {
    const [low, high] = tokenValues(tokens.slice(0, 2));
    minimum = Math.min(low, high);
    maximum = Math.max(low, high);
  } else {
    const [value] = tokenValues(tokens.slice(0, 1));
    const before = stripCurrency(normalized.slice(0, tokens[0].start));
    if (MINIMUM_ONLY.test(before) || /\s*\+/i.test(normalized.slice(tokens[0].end))) {
      minimum = value;
      maximum = null;
    } else if (MAXIMUM_ONLY.test(before)) {
      minimum = null;
      maximum = value;
    } else {
      minimum = value;
      maximum = value;
    }
  }

  const basis = HOURLY_HINTS.test(normalized) ? "HOURLY" : MONTHLY_HINTS.test(normalized) ? "MONTHLY" : "ANNUAL";
  return { minimum, maximum, currency, basis };
}

/** Puts any basis on an annual footing: monthly x12, hourly x2,080 hours. */
export function monthlyToAnnual(value: number, basis: string): number {
  if (basis === "MONTHLY") return value * 12;
  if (basis === "HOURLY") return value * 2080;
  return value;
}
