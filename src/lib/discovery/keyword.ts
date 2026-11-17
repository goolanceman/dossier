import type { ProfileCriteria } from "./profile";

// Stage 2 of the discovery pipeline (master.md §2.4): lightweight keyword
// matching, no AI. It pulls the sentences worth a model's attention out of
// a description, so the expensive stages never read a full job posting
// when ten sentences say the same. Pure functions only.

/** How much context one match keeps, and how many matches a list may hold, so the output stays small. */
export const CONTEXT_CHARS = 200;
export const MAX_MATCHES = 10;
const MIN_SENTENCE_CHARS = 3;
const MAX_SENTENCES = 2000;

export type KeywordMatches = {
  /** Sentences naming a required technology or keyword, with up to 200 characters of context each. */
  matchedRequired: string[];
  /** The same, for preferred technologies. */
  matchedPreferred: string[];
  /** The same, for the titles and alternative titles the profile looks for. */
  matchedTitleTerms: string[];
  /** A cheap 0-100 hint of how well the description covers the criteria, before any AI reads it. */
  scoreHint: number;
};

export const EMPTY_MATCHES: KeywordMatches = { matchedRequired: [], matchedPreferred: [], matchedTitleTerms: [], scoreHint: 0 };

/** Splits a description the way people write it: on newlines and sentence ends. */
export function sentencesOf(description: string): string[] {
  return description
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= MIN_SENTENCE_CHARS)
    .slice(0, MAX_SENTENCES);
}

/** The matched sentence padded with what follows it, up to a 200-character window. */
function windowAt(sentences: readonly string[], index: number): string {
  let text = sentences[index] ?? "";
  for (let next = index + 1; text.length < CONTEXT_CHARS && next < sentences.length; next += 1) text += ` ${sentences[next]}`;
  return text.slice(0, CONTEXT_CHARS);
}

const termsOf = (values: readonly string[]) => values.map((value) => value.trim().toLocaleLowerCase()).filter((value) => value !== "");

/**
 * Matches the description against the profile's criteria: the first
 * sentence each required, preferred and title term appears in, with
 * context, and a score hint weighted 55% required, 25% title, 20%
 * preferred (a group with no terms hands its weight to the others).
 */
export function keywordMatch(description: string, criteria: ProfileCriteria): KeywordMatches {
  const requiredTerms = termsOf([...criteria.requiredTech, ...criteria.requiredKeywords]);
  const preferredTerms = termsOf(criteria.preferredTech);
  const titleTerms = termsOf([...criteria.titles, ...criteria.altTitles]);
  if (requiredTerms.length === 0 && preferredTerms.length === 0 && titleTerms.length === 0) return EMPTY_MATCHES;

  const sentences = sentencesOf(description);
  const lowered = sentences.map((sentence) => sentence.toLocaleLowerCase());
  if (sentences.length === 0) return EMPTY_MATCHES;

  const collect = (terms: string[]): { windows: string[]; hits: number } => {
    const windows = new Set<string>();
    for (const term of terms) {
      const index = lowered.findIndex((sentence) => sentence.includes(term));
      if (index >= 0 && windows.size < MAX_MATCHES) windows.add(windowAt(sentences, index));
    }
    return { windows: [...windows], hits: terms.filter((term) => lowered.some((sentence) => sentence.includes(term))).length };
  };

  const required = collect(requiredTerms);
  const preferred = collect(preferredTerms);
  const titles = collect(titleTerms);

  // Coverage per group, weighted; groups without terms don't count against the score.
  const groups = [
    { weight: 0.55, total: requiredTerms.length, hits: required.hits },
    { weight: 0.25, total: titleTerms.length, hits: titles.hits },
    { weight: 0.2, total: preferredTerms.length, hits: preferred.hits },
  ].filter((group) => group.total > 0);
  const weight = groups.reduce((sum, group) => sum + group.weight, 0);
  const scoreHint = weight === 0 ? 0 : Math.round((groups.reduce((sum, group) => sum + (group.weight * group.hits) / group.total, 0) / weight) * 100);

  return { matchedRequired: required.windows, matchedPreferred: preferred.windows, matchedTitleTerms: titles.windows, scoreHint };
}
