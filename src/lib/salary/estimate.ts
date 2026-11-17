import "server-only";

import type { Prisma, SalaryEstimate, SalaryStatus } from "@/generated/prisma/client";
import type { SalaryResearch } from "@/lib/ai/task-contracts";
import { prisma } from "@/lib/prisma";

import { monthlyToAnnual, parseSalaryText, type SalaryBasis } from "./normalize";

// Salary intelligence (master.md Phase 4): where a posting's pay figure is
// kept and how it was reached. A figure is one of four kinds, and the kind is
// always shown with the figure: STATED comes from the advert itself,
// CONFIRMED from a public source, ESTIMATED from market data, UNAVAILABLE
// means no trustworthy figure exists. master.md §4: never present an estimate
// as a confirmed company offer, so the display label for a row may only come
// from estimateLabel, and isConfirmed is the only test for "confirmed".

/** Bases the SalaryEstimate.basis column can hold; anything else reads as annual, the column's default. */
const BASES: readonly SalaryBasis[] = ["ANNUAL", "MONTHLY", "HOURLY"];

const basisOf = (basis: string): SalaryBasis => (BASES as readonly string[]).includes(basis) ? (basis as SalaryBasis) : "ANNUAL";

/**
 * The user-facing wording for where a figure came from. master.md §4: an
 * ESTIMATED row never shows as a confirmed offer, because this label always
 * says which kind of figure it is.
 */
export function estimateLabel(status: SalaryStatus): string {
  if (status === "STATED") return "Stated in the job ad";
  if (status === "CONFIRMED") return "Publicly confirmed";
  if (status === "ESTIMATED") return "Estimated from market data";
  return "Unavailable";
}

/** The only "is this a confirmed offer" test: stated in the ad or publicly confirmed, never an estimate. */
export function isConfirmed(status: SalaryStatus): boolean {
  return status === "STATED" || status === "CONFIRMED";
}

/** What a figure is compared against: its low end, put on an annual footing. */
export function annualMinimum(estimate: Pick<SalaryEstimate, "minimum" | "basis"> | null): number | null {
  if (estimate === null || estimate.minimum === null) return null;
  return monthlyToAnnual(estimate.minimum, basisOf(estimate.basis));
}

/** True when the estimate's low end falls below the smallest pay the user accepts. An unknown figure never rejects. */
export function belowMinimum(estimate: Pick<SalaryEstimate, "minimum" | "basis"> | null, minimum: number): boolean {
  const low = annualMinimum(estimate);
  return low !== null && low < minimum;
}

/**
 * Keeps the pay the advert itself states (master.md §4, "salary stated in
 * JD"). Returns null when the posting's salary text has nothing parseable:
 * no figure is invented to fill the gap.
 */
export async function salaryFromPosting(posting: { id: string; company: string; title: string; place: string; salary: string; country?: string }): Promise<SalaryEstimate | null> {
  const parsed = parseSalaryText(posting.salary);
  if (parsed === null) return null;
  const { minimum, maximum, currency, basis } = parsed;
  const median = minimum !== null && maximum !== null ? Math.round((minimum + maximum) / 2) : null;
  const data = {
    company: posting.company,
    title: posting.title,
    place: posting.place,
    country: posting.country ?? "",
    status: "STATED" as const,
    minimum: minimum === null ? null : Math.round(minimum),
    median,
    maximum: maximum === null ? null : Math.round(maximum),
    currency,
    basis,
    confidence: "HIGH",
    sourceCount: 0,
    sources: [] as Prisma.InputJsonValue[],
    methodology: "As stated in the job advert.",
  };
  return prisma.salaryEstimate.upsert({
    where: { postingId: posting.id },
    create: { postingId: posting.id, ...data },
    update: { ...data },
  });
}

/** Input for saveResearched: who and where the figure is for, and what the research found. */
export type ResearchedInput = {
  /** Links the estimate to a posting; without one it is a company-level row. */
  postingId?: string;
  company: string;
  title: string;
  place: string;
  country: string;
  research: SalaryResearch;
  /** The prompt version that researched it, e.g. "salary-research@1". */
  researchedWith?: string;
};

/**
 * Persists a salary research result (master.md Phase 4): status, range,
 * currency, basis, confidence, the sources it used and the methodology, with
 * the research's own status (STATED, CONFIRMED, ESTIMATED, UNAVAILABLE). The
 * result is validated against its task contract by the caller; sources are
 * kept as given, never enriched.
 */
export async function saveResearched(input: ResearchedInput): Promise<SalaryEstimate> {
  const { research } = input;
  const data = {
    company: input.company,
    title: input.title,
    place: input.place,
    country: input.country,
    status: research.status,
    minimum: research.minimum === null ? null : Math.round(research.minimum),
    median: research.median === null ? null : Math.round(research.median),
    maximum: research.maximum === null ? null : Math.round(research.maximum),
    currency: research.currency,
    basis: research.basis,
    confidence: research.confidence,
    sourceCount: research.sources.length,
    sources: research.sources,
    methodology: research.methodology,
    researchedWith: input.researchedWith ?? "",
  };
  if (input.postingId === undefined) return prisma.salaryEstimate.create({ data });
  return prisma.salaryEstimate.upsert({
    where: { postingId: input.postingId },
    create: { postingId: input.postingId, ...data },
    update: { ...data },
  });
}

/** The estimate kept for one posting, or null when none was made. */
export function getEstimate(postingId: string): Promise<SalaryEstimate | null> {
  return prisma.salaryEstimate.findUnique({ where: { postingId } });
}

/** The newest estimate for the same company, title and place, or null. */
export function getEstimateForCompany(company: string, title: string, place: string): Promise<SalaryEstimate | null> {
  return prisma.salaryEstimate.findFirst({ where: { company, title, place }, orderBy: { updatedAt: "desc" } });
}
