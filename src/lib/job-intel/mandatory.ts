import { z } from "zod";
import { assessmentDecisionSchema, dimensionScoresSchema } from "@/lib/ai/task-contracts";
import { monthlyToAnnual, parseSalaryText } from "@/lib/salary/normalize";

// Mandatory rejection rules (master.md §3.2): a handful of hard noes that no
// score may talk the decision out of. Pure functions, so the deterministic
// stage and the tests can run them without a database.

export type DimensionScores = z.output<typeof dimensionScoresSchema>;
export type AssessmentDecision = z.output<typeof assessmentDecisionSchema>;

/** One failed rule, with its stable key and a reason in words for the user. */
export type MandatoryRule = { rule: string; reason: string };

export type MandatoryInput = {
  profile: {
    /** The smallest annual pay the user accepts, in profile.currency. */
    salaryMin?: number | null;
    currency?: string;
    /** Countries (names or ISO codes) the user can work remote from. */
    remoteCountries?: string[];
  };
  posting: {
    /** Null when the source doesn't say. */
    remote: boolean | null;
    place: string;
    salaryText: string;
    title: string;
  };
  assessment: { dimensions: DimensionScores };
  /** Required technologies the evidence library cannot back. */
  missingRequiredTech?: string[];
};

const PLACE_FILLERS = /\b(?:remote|hybrid|on\s?site|onsite|work from home|wfh|worldwide|anywhere|global)\b/gi;

/** True when the place names one of the countries: names by substring, two-letter ISO codes on word boundaries. */
function placeMentions(place: string, country: string): boolean {
  const needle = country.trim().toLowerCase();
  if (needle === "") return false;
  if (needle.length === 2) return new RegExp(`\\b${needle}\\b`, "i").test(place);
  return place.toLowerCase().includes(needle);
}

/**
 * Checks the master.md §3.2 mandatory rejection rules in a fixed order and
 * returns the first one that fails, or null when none does. Salary is only
 * rejected when the advert's currency is the profile's own: converting
 * currencies would be guessing (master.md Phase 4).
 */
export function checkMandatoryRules(input: MandatoryInput): MandatoryRule | null {
  const { profile, posting, assessment } = input;
  const salaryMin = profile.salaryMin ?? null;
  const currency = profile.currency?.trim().toUpperCase() ?? "";
  const parsed = parseSalaryText(posting.salaryText);
  if (salaryMin !== null && salaryMin > 0 && parsed !== null && (currency === "" || parsed.currency === currency) && parsed.maximum !== null) {
    const top = monthlyToAnnual(parsed.maximum, parsed.basis);
    if (top < salaryMin) {
      return {
        rule: "salary-below-minimum",
        reason: `The pay stated in the advert for ${posting.title} tops out at ${parsed.maximum.toLocaleString("en-GB")} ${parsed.currency} a ${parsed.basis === "HOURLY" ? "hour" : parsed.basis === "MONTHLY" ? "month" : "year"}, below your minimum of ${salaryMin.toLocaleString("en-GB")}.`,
      };
    }
  }

  const remoteCountries = profile.remoteCountries ?? [];
  if (posting.remote === true && remoteCountries.length > 0) {
    // Strip the remote wording, then anything that isn't a place name: a place
    // that only says "Remote - Worldwide" names no country, so there is
    // nothing to reject on; a named country that is not the user's rejects.
    const location = posting.place
      .replace(PLACE_FILLERS, " ")
      .replace(/[^\p{L}\p{M}\s,]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (location !== "" && !remoteCountries.some((country) => placeMentions(location, country))) {
      return {
        rule: "remote-country",
        reason: `The remote role is based in ${location}, which is not among the countries you can work remotely from.`,
      };
    }
  }

  if (assessment.dimensions.seniority < 25) {
    return {
      rule: "experience-beyond-level",
      reason: `The seniority the role needs is substantially beyond your level (seniority score ${assessment.dimensions.seniority} of 100).`,
    };
  }

  const missing = (input.missingRequiredTech ?? []).map((tech) => tech.trim()).filter(Boolean);
  if (missing.length > 0) {
    return {
      rule: "missing-required-tech",
      reason: `Nothing in your evidence library backs the required technology: ${missing.join(", ")}.`,
    };
  }

  return null;
}

/**
 * Forces a rejection the rules called for (master.md §3.2): the recommendation
 * becomes REJECT and mandatoryRejection is set, whatever the score said, and
 * the reasons are kept ahead of the original summary. With no rules the
 * decision passes through untouched.
 */
export function applyMandatoryRules(decision: AssessmentDecision, rules: MandatoryRule[]): AssessmentDecision {
  if (rules.length === 0) return decision;
  const reasons = rules.map((rule) => rule.reason);
  const summary = [...reasons, decision.summary].map((text) => text.trim()).filter(Boolean).join(" ");
  return { ...decision, recommendation: "REJECT", mandatoryRejection: true, summary };
}
