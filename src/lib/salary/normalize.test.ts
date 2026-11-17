import { describe, expect, it } from "vitest";

import { monthlyToAnnual, parseSalaryText, type ParsedSalary } from "./normalize";

describe("parseSalaryText", () => {
  it.each<[string, ParsedSalary | null]>([
    // The formats the sources actually give.
    ["EUR 60,000-75,000 a year", { minimum: 60000, maximum: 75000, currency: "EUR", basis: "ANNUAL" }],
    ["$60k-$80k", { minimum: 60000, maximum: 80000, currency: "USD", basis: "ANNUAL" }],
    ["€50-60 per hour", { minimum: 50, maximum: 60, currency: "EUR", basis: "HOURLY" }],
    ["£45,000 pa", { minimum: 45000, maximum: 45000, currency: "GBP", basis: "ANNUAL" }],
    ["60-70k USD", { minimum: 60000, maximum: 70000, currency: "USD", basis: "ANNUAL" }],
    // En dashes and spaced ranges.
    ["USD 60,000 – 75,000 a year", { minimum: 60000, maximum: 75000, currency: "USD", basis: "ANNUAL" }],
    ["CHF 80,000 to 95,000", { minimum: 80000, maximum: 95000, currency: "CHF", basis: "ANNUAL" }],
    // One-sided figures.
    ["up to €75,000", { minimum: null, maximum: 75000, currency: "EUR", basis: "ANNUAL" }],
    ["from CHF 80,000", { minimum: 80000, maximum: null, currency: "CHF", basis: "ANNUAL" }],
    ["PLN 25,000+", { minimum: 25000, maximum: null, currency: "PLN", basis: "ANNUAL" }],
    // Other bases.
    ["$45/hr", { minimum: 45, maximum: 45, currency: "USD", basis: "HOURLY" }],
    ["5,500 USD a month", { minimum: 5500, maximum: 5500, currency: "USD", basis: "MONTHLY" }],
    ["£12.50 an hour", { minimum: 12.5, maximum: 12.5, currency: "GBP", basis: "HOURLY" }],
    // Space and dot thousand separators, as Nordic and Polish ads write them.
    ["SEK 45 000 - 55 000", { minimum: 45000, maximum: 55000, currency: "SEK", basis: "ANNUAL" }],
    ["45.000 - 55.000 PLN", { minimum: 45000, maximum: 55000, currency: "PLN", basis: "ANNUAL" }],
    ["DKK 35,000 monthly", { minimum: 35000, maximum: 35000, currency: "DKK", basis: "MONTHLY" }],
    // One figure is still a (point) range.
    ["NOK 650,000 a year", { minimum: 650000, maximum: 650000, currency: "NOK", basis: "ANNUAL" }],
  ])("parses %s", (text, expected) => {
    expect(parseSalaryText(text)).toEqual(expected);
  });

  it.each([
    "Competitive salary",
    "60,000-75,000 a year",
    "Salary: negotiable",
    "€ - ",
    "N/A",
    "",
  ])("refuses to guess: %s", (text) => {
    expect(parseSalaryText(text)).toBeNull();
  });

  it("does not treat neighbouring numbers without a separator as a range", () => {
    const parsed = parseSalaryText("EUR 60,000 75,000 a year");
    expect(parsed).toEqual({ minimum: 60000, maximum: 60000, currency: "EUR", basis: "ANNUAL" });
  });

  it("does not reject a range whose top reaches the minimum", () => {
    const parsed = parseSalaryText("USD 50,000-60,000 a year");
    expect(parsed).toEqual({ minimum: 50000, maximum: 60000, currency: "USD", basis: "ANNUAL" });
  });
});

describe("monthlyToAnnual", () => {
  it.each([
    [60000, "ANNUAL", 60000],
    [5000, "MONTHLY", 60000],
    [30, "HOURLY", 62400],
  ])("annualises %s %s to %s", (value, basis, expected) => {
    expect(monthlyToAnnual(value, basis)).toBe(expected);
  });
});
