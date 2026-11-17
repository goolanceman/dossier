import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { SalaryResearch } from "@/lib/ai/task-contracts";
import { createTestClient, resetDatabase } from "@/test/db";

import { belowMinimum, estimateLabel, getEstimate, getEstimateForCompany, isConfirmed, salaryFromPosting, saveResearched } from "./estimate";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

let postingId: string;

beforeEach(async () => {
  await resetDatabase(prisma());
  const posting = await prisma().posting.create({ data: { source: "JSEARCH", externalId: "job-1", title: "Backend Engineer", company: "Northwind", place: "Berlin", salary: "EUR 60,000-75,000 a year" } });
  postingId = posting.id;
});
afterAll(() => prisma().$disconnect());

const research: SalaryResearch = {
  schema_version: "1.0",
  task: "salary_research",
  status: "ESTIMATED",
  minimum: 70000,
  median: 80000,
  maximum: 90000,
  currency: "USD",
  basis: "ANNUAL",
  confidence: "MEDIUM",
  sources: [{ url: "https://www.glassdoor.com/Salary/northwind", label: "Glassdoor", retrievedAt: "2026-11-17" }],
  methodology: "Midpoint of the ranges three sources give for this title in Berlin.",
};

describe("salaryFromPosting", () => {
  it("keeps the advert's own figure as stated, with high confidence", async () => {
    const estimate = await salaryFromPosting({ id: postingId, company: "Northwind", title: "Backend Engineer", place: "Berlin", salary: "EUR 60,000-75,000 a year" });
    expect(estimate).toMatchObject({
      postingId,
      status: "STATED",
      confidence: "HIGH",
      minimum: 60000,
      median: 67500,
      maximum: 75000,
      currency: "EUR",
      basis: "ANNUAL",
      sourceCount: 0,
      sources: [],
      methodology: "As stated in the job advert.",
    });
  });

  it("invents nothing when the advert's text has no parseable figure", async () => {
    const estimate = await salaryFromPosting({ id: postingId, company: "Northwind", title: "Backend Engineer", place: "Berlin", salary: "Competitive salary" });
    expect(estimate).toBeNull();
    expect(await prisma().salaryEstimate.count()).toBe(0);
  });

  it("rounds hourly decimals to whole amounts", async () => {
    const estimate = await salaryFromPosting({ id: postingId, company: "Northwind", title: "Backend Engineer", place: "Berlin", salary: "£12.50 an hour" });
    expect(estimate).toMatchObject({ minimum: 13, maximum: 13, currency: "GBP", basis: "HOURLY" });
  });

  it("replaces the figure when the advert is read again", async () => {
    await salaryFromPosting({ id: postingId, company: "Northwind", title: "Backend Engineer", place: "Berlin", salary: "€50-60 per hour" });
    const again = await salaryFromPosting({ id: postingId, company: "Northwind", title: "Backend Engineer", place: "Berlin", salary: "EUR 60,000-75,000 a year" });
    expect(again).toMatchObject({ basis: "ANNUAL", minimum: 60000 });
    expect(await prisma().salaryEstimate.count()).toBe(1);
  });
});

describe("saveResearched", () => {
  it("persists the research result with its sources and methodology", async () => {
    const saved = await saveResearched({ postingId, company: "Northwind", title: "Backend Engineer", place: "Berlin", country: "DE", research, researchedWith: "salary-research@1" });
    expect(saved).toMatchObject({
      postingId,
      status: "ESTIMATED",
      minimum: 70000,
      median: 80000,
      maximum: 90000,
      currency: "USD",
      basis: "ANNUAL",
      confidence: "MEDIUM",
      sourceCount: 1,
      methodology: research.methodology,
      researchedWith: "salary-research@1",
    });
    expect(saved.sources).toEqual(research.sources);
  });

  it("updates the same posting's row instead of adding a second one", async () => {
    await saveResearched({ postingId, company: "Northwind", title: "Backend Engineer", place: "Berlin", country: "DE", research });
    await saveResearched({ postingId, company: "Northwind", title: "Backend Engineer", place: "Berlin", country: "DE", research: { ...research, status: "CONFIRMED", maximum: 92000 } });
    expect(await prisma().salaryEstimate.count()).toBe(1);
    expect(await getEstimate(postingId)).toMatchObject({ status: "CONFIRMED", maximum: 92000 });
  });

  it("keeps a company-level row when there is no posting", async () => {
    await saveResearched({ company: "Northwind", title: "Backend Engineer", place: "Berlin", country: "DE", research });
    const found = await getEstimateForCompany("Northwind", "Backend Engineer", "Berlin");
    expect(found).toMatchObject({ postingId: null, status: "ESTIMATED", company: "Northwind" });
  });
});

describe("estimate lookups", () => {
  it("finds a posting's estimate or nothing", async () => {
    expect(await getEstimate(postingId)).toBeNull();
    await salaryFromPosting({ id: postingId, company: "Northwind", title: "Backend Engineer", place: "Berlin", salary: "EUR 60,000-75,000 a year" });
    expect(await getEstimate(postingId)).toMatchObject({ postingId });
  });
});

describe("belowMinimum", () => {
  it.each([
    ["a stated range under the minimum", "60,000 USD a year", 65000, true],
    ["a stated range reaching the minimum", "65,000 USD a year", 65000, false],
    ["an hourly figure, annualised first", "30 USD an hour", 65000, true],
    ["a monthly figure, annualised first", "5,000 USD a month", 65000, true],
    ["no figure at all", "Competitive salary", 65000, false],
  ])("rejects on %s", async (_name, salary, minimum, expected) => {
    const estimate = await salaryFromPosting({ id: postingId, company: "Northwind", title: "Backend Engineer", place: "Berlin", salary });
    expect(belowMinimum(estimate === null ? null : { minimum: estimate.minimum, basis: estimate.basis }, minimum)).toBe(expected);
  });

  it("never rejects on a missing estimate", () => {
    expect(belowMinimum(null, 65000)).toBe(false);
  });
});

describe("the master.md §4 guard", () => {
  it("labels every kind of figure, so an estimate never shows as a confirmed offer", () => {
    expect(estimateLabel("STATED")).toBe("Stated in the job ad");
    expect(estimateLabel("CONFIRMED")).toBe("Publicly confirmed");
    expect(estimateLabel("ESTIMATED")).toBe("Estimated from market data");
    expect(estimateLabel("UNAVAILABLE")).toBe("Unavailable");
  });

  it("counts only stated and confirmed as confirmed", () => {
    expect(isConfirmed("STATED")).toBe(true);
    expect(isConfirmed("CONFIRMED")).toBe(true);
    expect(isConfirmed("ESTIMATED")).toBe(false);
    expect(isConfirmed("UNAVAILABLE")).toBe(false);
  });
});
