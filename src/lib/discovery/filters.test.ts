import { describe, expect, it } from "vitest";

import type { FoundPosting } from "@/lib/job-search/search";

import { companySizeRange, deterministicFilter, discoveryKey, duplicateFinder, parseSalaryTop, reasonText, statedEmployees } from "./filters";
import { EMPTY_CRITERIA } from "./profile";

const BASE_DESCRIPTION =
  "You will build services with Node.js, TypeScript and Postgres. Our team runs on Kafka and ships every day. The role is full-time at our Berlin office.";

const posting = (extra: Partial<FoundPosting> = {}): FoundPosting => ({
  source: "JSEARCH",
  externalId: "job-1",
  title: "Senior Backend Engineer",
  company: "Northwind Studio",
  place: "Berlin",
  remote: false,
  salary: "EUR 70,000 - 90,000",
  postedAt: "2026-11-16T08:00:00.000Z",
  url: "https://jobs.example/1",
  via: "LinkedIn",
  description: BASE_DESCRIPTION,
  complete: true,
  ...extra,
});

const profile = (extra: Partial<Parameters<typeof deterministicFilter>[1]> = {}) => ({
  remotePreference: "REMOTE_OR_HYBRID",
  salaryMin: null,
  currency: "",
  startupOnly: false,
  companySize: "",
  criteria: EMPTY_CRITERIA,
  ...extra,
});

const failsWith = (found: FoundPosting, reason: string, with_: Partial<Parameters<typeof deterministicFilter>[1]> = {}) => {
  const outcome = deterministicFilter(found, profile(with_));
  expect(outcome).toEqual({ passed: false, reason });
};

describe("deterministicFilter", () => {
  it("passes a posting that trips nothing", () => {
    expect(deterministicFilter(posting(), profile())).toEqual({ passed: true, reason: "" });
  });

  it("rejects unusable descriptions: too short, or without title and company", () => {
    failsWith(posting({ description: "Too short." }), "INVALID_DESCRIPTION");
    failsWith(posting({ title: "" }), "INVALID_DESCRIPTION");
    failsWith(posting({ company: "" }), "INVALID_DESCRIPTION");
  });

  it("rejects a blacklisted company, case-insensitively, unless it's whitelisted", () => {
    const blacklist = profile({ criteria: { ...EMPTY_CRITERIA, companyBlacklist: ["BLACKCO GMBH"] } });
    failsWith(posting({ company: "Blackco GmbH" }), "BLACKLISTED_COMPANY", blacklist);
    // Exact names only: a different company that merely mentions it passes.
    expect(deterministicFilter(posting(), blacklist).passed).toBe(true);
    const whitelisted = profile({ criteria: { ...EMPTY_CRITERIA, companyBlacklist: ["Blackco GmbH"], companyWhitelist: ["BLACKCO GMBH"] } });
    expect(deterministicFilter(posting({ company: "blackco gmbh" }), whitelisted).passed).toBe(true);
  });

  it("rejects excluded keywords in the title only, and excluded tech anywhere", () => {
    failsWith(posting({ title: "PHP Backend Engineer" }), "EXCLUDED_KEYWORD", { criteria: { ...EMPTY_CRITERIA, excludedKeywords: ["PHP"] } });
    // "PHP" in the description alone isn't an excluded keyword; that's what excluded tech is for.
    expect(
      deterministicFilter(posting({ description: `${BASE_DESCRIPTION} We also maintain some PHP.` }), profile({ criteria: { ...EMPTY_CRITERIA, excludedKeywords: ["PHP"] } })).passed,
    ).toBe(true);
    failsWith(posting({ description: `${BASE_DESCRIPTION} Legacy work on our PHP monolith.` }), "EXCLUDED_TECH", { criteria: { ...EMPTY_CRITERIA, excludedTech: ["PHP"] } });
    expect(deterministicFilter(posting(), profile({ criteria: { ...EMPTY_CRITERIA, excludedTech: ["Rails"] } })).passed).toBe(true);
  });

  it("rejects when a required keyword is missing from title or description", () => {
    expect(deterministicFilter(posting(), profile({ criteria: { ...EMPTY_CRITERIA, requiredKeywords: ["TypeScript"] } })).passed).toBe(true);
    failsWith(posting(), "MISSING_REQUIRED_KEYWORD", { criteria: { ...EMPTY_CRITERIA, requiredKeywords: ["Kubernetes"] } });
  });

  it("rejects an employment type the profile doesn't allow, when the description states one", () => {
    expect(deterministicFilter(posting(), profile({ criteria: { ...EMPTY_CRITERIA, employmentTypes: ["FULL_TIME"] } })).passed).toBe(true);
    failsWith(posting(), "EMPLOYMENT_TYPE_MISMATCH", { criteria: { ...EMPTY_CRITERIA, employmentTypes: ["CONTRACT"] } });
    // Nothing stated passes, and so does a description offering two, one of them allowed.
    expect(deterministicFilter(posting({ description: `${BASE_DESCRIPTION.replace("full-time", "quiet")} A small focused team.` }), profile({ criteria: { ...EMPTY_CRITERIA, employmentTypes: ["CONTRACT"] } })).passed).toBe(true);
    expect(deterministicFilter(posting({ description: `${BASE_DESCRIPTION.replace("full-time", "full-time or contract")}` }), profile({ criteria: { ...EMPTY_CRITERIA, employmentTypes: ["CONTRACT"] } })).passed).toBe(true);
  });

  it("rejects a stated salary below the minimum, and skips what it can't compare", () => {
    failsWith(posting({ salary: "EUR 30,000 - 40,000" }), "SALARY_BELOW_MINIMUM", { salaryMin: 60000 });
    expect(deterministicFilter(posting({ salary: "EUR 30,000 - 40,000" }), profile({ salaryMin: 30000 })).passed).toBe(true);
    // Hourly wages and other currencies are left to the AI stages.
    expect(deterministicFilter(posting({ salary: "12,50 EUR per hour" }), profile({ salaryMin: 60000 })).passed).toBe(true);
    expect(deterministicFilter(posting({ salary: "$30,000 - 40,000" }), profile({ salaryMin: 60000, currency: "EUR" })).passed).toBe(true);
    expect(deterministicFilter(posting({ salary: "" }), profile({ salaryMin: 60000 })).passed).toBe(true);
  });

  it("rejects a remote arrangement the profile forbids", () => {
    failsWith(posting({ remote: false }), "REMOTE_MISMATCH", { remotePreference: "REMOTE_ONLY" });
    expect(deterministicFilter(posting({ remote: null }), profile({ remotePreference: "REMOTE_ONLY" })).passed).toBe(true);
    failsWith(posting({ remote: true }), "REMOTE_MISMATCH", { remotePreference: "ONSITE_OK" });
    expect(deterministicFilter(posting({ remote: true }), profile({ remotePreference: "REMOTE_OR_HYBRID" })).passed).toBe(true);
  });

  it("rejects a stated company size outside the profile's range", () => {
    const sized = posting({ description: `${BASE_DESCRIPTION} We are 2,000+ employees across Europe.` });
    failsWith(sized, "COMPANY_SIZE_MISMATCH", { companySize: "50-200" });
    expect(deterministicFilter(sized, profile({ companySize: "100-5000" })).passed).toBe(true);
    // Nothing stated passes, and so does a posting without a range to check against.
    expect(deterministicFilter(posting(), profile({ companySize: "50-200" })).passed).toBe(true);
    expect(deterministicFilter(sized, profile()).passed).toBe(true);
  });

  it("rejects a non-startup for a startup-only profile, when the description tells on it", () => {
    failsWith(posting({ description: `${BASE_DESCRIPTION} Backed by a Fortune 500 parent.` }), "STARTUP_ONLY_MISMATCH", { startupOnly: true });
    const sized = posting({ description: `${BASE_DESCRIPTION} We are 5,000+ employees.` });
    failsWith(sized, "STARTUP_ONLY_MISMATCH", { startupOnly: true });
    expect(deterministicFilter(posting(), profile({ startupOnly: true })).passed).toBe(true);
    expect(deterministicFilter(sized, profile()).passed).toBe(true);
  });

  it("documents every rejection with human text", () => {
    expect(reasonText("BLACKLISTED_COMPANY")).toContain("blacklist");
    expect(reasonText("NO_SUCH_KEY")).toBe("NO_SUCH_KEY");
  });
});

describe("parseSalaryTop", () => {
  it("reads the top of a range in the formats sources write", () => {
    expect(parseSalaryTop("EUR 60,000 - 75,000 a year")).toBe(75000);
    expect(parseSalaryTop("€60.000 - €75.000")).toBe(75000);
    expect(parseSalaryTop("45k-60k")).toBe(60000);
    expect(parseSalaryTop("$75,000")).toBe(75000);
    expect(parseSalaryTop("60 000 CZK")).toBe(60000);
    expect(parseSalaryTop("75.5")).toBe(75.5);
    expect(parseSalaryTop("Competitive")).toBeNull();
    expect(parseSalaryTop("")).toBeNull();
  });
});

describe("statedEmployees and companySizeRange", () => {
  it("reads employee counts and size ranges", () => {
    expect(statedEmployees("Join our 2,000+ employees worldwide.")).toBe(2000);
    expect(statedEmployees("Über 500 Mitarbeiter in Berlin.")).toBe(500);
    expect(statedEmployees("A small team.")).toBeNull();
    expect(companySizeRange("50-200")).toEqual([50, 200]);
    expect(companySizeRange("200")).toEqual([200, 200]);
    expect(companySizeRange("startup")).toBeNull();
  });
});

describe("duplicateFinder", () => {
  const same = posting({ externalId: "job-1" });
  const byLink = posting({ externalId: "other-id", url: "https://jobs.example/1?utm_source=x&ref=feed" });
  const noLink = posting({ externalId: "nl-1", url: "" });
  const byFacts = posting({ externalId: "nl-2", url: "", company: "NORTHWIND  Studio" });
  const other = posting({ externalId: "job-2", title: "Platform Engineer", url: "https://jobs.example/2" });

  it("keeps the first of a run's repeats, by link, facts or source id", () => {
    const { fresh, duplicates } = duplicateFinder([same, byLink, noLink, byFacts, other]);
    expect(fresh.map((entry) => entry.externalId)).toEqual(["job-1", "nl-1", "job-2"]);
    expect(duplicates.map((entry) => entry.externalId)).toEqual(["other-id", "nl-2"]);
  });

  it("drops what an earlier run assessed, keyed by postingKey", () => {
    const { fresh, duplicates } = duplicateFinder([same, other], ["JSEARCH:job-2"]);
    expect(fresh.map((entry) => entry.externalId)).toEqual(["job-1"]);
    expect(duplicates.map((entry) => entry.externalId)).toEqual(["job-2"]);
  });

  it("keys equal jobs alike for the pipeline to store", () => {
    // With a link, the link without tracking parameters is the key.
    expect(discoveryKey(same)).toBe(discoveryKey(byLink));
    // Without one, company, title and place are.
    expect(discoveryKey(noLink)).toBe(discoveryKey(byFacts));
    expect(discoveryKey(same)).not.toBe(discoveryKey(other));
    // Without a link or facts, the source's id stands in.
    const bare = { source: "JSEARCH" as const, externalId: "x", url: "", title: "", company: "", place: "" };
    expect(discoveryKey(bare)).toBe(discoveryKey(bare));
  });
});
