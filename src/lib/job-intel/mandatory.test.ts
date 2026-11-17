import { describe, expect, it } from "vitest";

import type { DimensionScores } from "./weights";

import { applyMandatoryRules, checkMandatoryRules, type AssessmentDecision, type MandatoryInput } from "./mandatory";

const dimensions = (seniority = 80): DimensionScores => ({
  technicalSkills: 80,
  relevantExperience: 80,
  responsibilities: 80,
  architecture: 80,
  seniority,
  domain: 80,
  locationRemote: 80,
  employmentConditions: 80,
});

const base = (): MandatoryInput => ({
  profile: { salaryMin: 55000, currency: "USD", remoteCountries: ["Germany", "Netherlands"] },
  posting: { remote: false, place: "Berlin, Germany", salaryText: "USD 60,000-75,000 a year", title: "Backend Engineer" },
  assessment: { dimensions: dimensions() },
  missingRequiredTech: [],
});

const decision = (over: Partial<AssessmentDecision> = {}): AssessmentDecision => ({
  recommendation: "APPLY",
  compatibilityScore: 92,
  confidence: "HIGH",
  mandatoryRejection: false,
  summary: "Strong all round.",
  ...over,
});

describe("checkMandatoryRules", () => {
  it("passes a posting that breaks no rule", () => {
    expect(checkMandatoryRules(base())).toBeNull();
  });

  it("rejects when the advert's top of range is below the profile minimum", () => {
    const input = base();
    input.posting.salaryText = "USD 50,000-52,000 a year";
    expect(checkMandatoryRules(input)).toEqual({
      rule: "salary-below-minimum",
      reason: "The pay stated in the advert for Backend Engineer tops out at 52,000 USD a year, below your minimum of 55,000.",
    });
  });

  it("rejects a single stated figure below the minimum", () => {
    const input = base();
    input.posting.salaryText = "USD 48,000 a year";
    expect(checkMandatoryRules(input)?.rule).toBe("salary-below-minimum");
  });

  it("lets a range that reaches the minimum through", () => {
    const input = base();
    input.posting.salaryText = "USD 50,000-60,000 a year";
    expect(checkMandatoryRules(input)).toBeNull();
  });

  it("annualises hourly and monthly figures before comparing", () => {
    const hourly = base();
    hourly.posting.salaryText = "20 USD an hour";
    expect(checkMandatoryRules(hourly)?.rule).toBe("salary-below-minimum");
    const monthly = base();
    monthly.posting.salaryText = "4,000 USD a month";
    expect(checkMandatoryRules(monthly)?.rule).toBe("salary-below-minimum");
  });

  it("does not compare across currencies, because code must not convert (master.md Phase 4)", () => {
    const input = base();
    input.posting.salaryText = "GBP 50,000-52,000 a year";
    expect(checkMandatoryRules(input)).toBeNull();
  });

  it("does not reject without a stated minimum", () => {
    const input = base();
    input.profile.salaryMin = null;
    input.posting.salaryText = "USD 10,000 a year";
    expect(checkMandatoryRules(input)).toBeNull();
  });

  it("rejects a remote posting based outside the countries the user can work from", () => {
    const input = base();
    input.posting.remote = true;
    input.posting.place = "Warsaw, Poland";
    expect(checkMandatoryRules(input)).toEqual({
      rule: "remote-country",
      reason: "The remote role is based in Warsaw, Poland, which is not among the countries you can work remotely from.",
    });
  });

  it("passes a remote posting in an allowed country", () => {
    const input = base();
    input.posting.remote = true;
    expect(checkMandatoryRules(input)).toBeNull();
  });

  it("passes a remote posting that names no country, like worldwide", () => {
    const input = base();
    input.posting.remote = true;
    input.posting.place = "Remote - Worldwide";
    expect(checkMandatoryRules(input)).toBeNull();
  });

  it("passes on-site postings whatever the place, and when no remote countries are set", () => {
    const input = base();
    input.posting.place = "Warsaw, Poland";
    expect(checkMandatoryRules(input)).toBeNull();
    const unconfigured = base();
    unconfigured.profile.remoteCountries = [];
    unconfigured.posting.remote = true;
    expect(checkMandatoryRules(unconfigured)).toBeNull();
  });

  it("rejects seniority substantially beyond the level", () => {
    const input = base();
    input.assessment.dimensions = dimensions(20);
    expect(checkMandatoryRules(input)).toEqual({
      rule: "experience-beyond-level",
      reason: "The seniority the role needs is substantially beyond your level (seniority score 20 of 100).",
    });
  });

  it("passes at the level the rule draws the line at", () => {
    const input = base();
    input.assessment.dimensions = dimensions(25);
    expect(checkMandatoryRules(input)).toBeNull();
  });

  it("rejects required technology the library cannot back", () => {
    const input = base();
    input.missingRequiredTech = ["Kubernetes", " Terraform ", ""];
    expect(checkMandatoryRules(input)).toEqual({
      rule: "missing-required-tech",
      reason: "Nothing in your evidence library backs the required technology: Kubernetes, Terraform.",
    });
  });

  it("reports the first failed rule, and a score never overrides it", () => {
    const input = base();
    input.posting.salaryText = "USD 50,000-52,000 a year";
    input.missingRequiredTech = ["Kubernetes"];
    expect(checkMandatoryRules(input)?.rule).toBe("salary-below-minimum");
  });
});

describe("applyMandatoryRules", () => {
  it("passes the decision through when no rule failed", () => {
    const original = decision();
    expect(applyMandatoryRules(original, [])).toBe(original);
  });

  it("forces REJECT and mandatoryRejection whatever the score said", () => {
    const overruled = applyMandatoryRules(decision(), [{ rule: "remote-country", reason: "The remote role is based in Warsaw, Poland, which is not among the countries you can work remotely from." }]);
    expect(overruled).toMatchObject({ recommendation: "REJECT", mandatoryRejection: true, compatibilityScore: 92 });
    expect(overruled.summary).toContain("Warsaw, Poland");
    expect(overruled.summary).toContain("Strong all round.");
  });

  it("keeps the rule's reason even when the summary was empty", () => {
    const overruled = applyMandatoryRules(decision({ summary: "" }), [{ rule: "salary-below-minimum", reason: "Pay below your minimum." }]);
    expect(overruled.recommendation).toBe("REJECT");
    expect(overruled.summary).toBe("Pay below your minimum.");
  });

  it("lists every failed rule's reason", () => {
    const overruled = applyMandatoryRules(decision({ summary: "" }), [
      { rule: "salary-below-minimum", reason: "Pay below your minimum." },
      { rule: "missing-required-tech", reason: "No evidence for Kubernetes." },
    ]);
    expect(overruled.summary).toBe("Pay below your minimum. No evidence for Kubernetes.");
  });
});
