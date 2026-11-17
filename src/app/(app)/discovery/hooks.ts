import "server-only";

import type { AssessmentDecision } from "@/generated/prisma/client";
import { getProviderForTask } from "@/lib/ai/routing";
import { assessJob, screenPosting } from "@/lib/ai/tasks";
import { listAchievements } from "@/lib/career/achievements";
import { listOf, criteriaFrom, type ProfileCriteria } from "@/lib/discovery/profile";
import { runDueProfiles, setPipelineHooks } from "@/lib/discovery/runner";
import { postingText } from "@/lib/job-search/search";
import { checkMandatoryRules } from "@/lib/job-intel/mandatory";
import { persistAssessment } from "@/lib/job-intel/assess";
import { logServerError } from "@/lib/log";
import { loadProfile } from "@/lib/profile-data";
import { prisma } from "@/lib/prisma";

import type { AssessFn, ScreenFn } from "@/lib/discovery/pipeline";

// The discovery pipeline's AI stages (master.md §2.4 stages 3–4) and its
// schedules, wired once at startup from instrumentation.ts. The pipeline
// itself stays free of the AI wiring: without hooks it shortlists by
// keyword score and leaves assessments pending.

/** What the candidate is looking for, as one text the screener reads. */
function criteriaText(criteria: ProfileCriteria, salaryMin: number | null, currency: string): string {
  const lines = [
    criteria.titles.length > 0 && `Titles: ${criteria.titles.join(", ")}`,
    criteria.altTitles.length > 0 && `Alternative titles: ${criteria.altTitles.join(", ")}`,
    criteria.requiredKeywords.length > 0 && `Required keywords: ${criteria.requiredKeywords.join(", ")}`,
    criteria.excludedKeywords.length > 0 && `Keywords to avoid: ${criteria.excludedKeywords.join(", ")}`,
    criteria.requiredTech.length > 0 && `Required technology: ${criteria.requiredTech.join(", ")}`,
    criteria.preferredTech.length > 0 && `Preferred technology: ${criteria.preferredTech.join(", ")}`,
    criteria.excludedTech.length > 0 && `Technology to avoid: ${criteria.excludedTech.join(", ")}`,
    criteria.seniority.length > 0 && `Seniority: ${criteria.seniority.join(", ")}`,
    criteria.employmentTypes.length > 0 && `Employment types: ${criteria.employmentTypes.join(", ")}`,
    criteria.remoteCountries.length > 0 && `Countries the candidate can work remote from: ${criteria.remoteCountries.join(", ")}`,
    criteria.companyBlacklist.length > 0 && `Companies to avoid: ${criteria.companyBlacklist.join(", ")}`,
    criteria.companyWhitelist.length > 0 && `Companies of special interest: ${criteria.companyWhitelist.join(", ")}`,
    criteria.industries.length > 0 && `Industries: ${criteria.industries.join(", ")}`,
    salaryMin !== null && `Minimum acceptable pay: ${salaryMin.toLocaleString("en-GB")}${currency ? ` ${currency} a year` : ""}`,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

/**
 * The screen runs before anything ties the posting to a profile (the
 * pipeline passes only the posting), so the screener reads the criteria of
 * the profiles whose runs are in flight together — one, its own; several,
 * their union. The cheap stage only decides whether a posting is worth a
 * full look; the assessment judges against one profile's own criteria.
 */
async function screenCriteria(): Promise<string> {
  const running = await prisma.jobSearchProfile.findMany({
    where: { enabled: true, runs: { some: { status: "RUNNING" } } },
  });
  const profiles = running.length > 0 ? running : await prisma.jobSearchProfile.findMany({ where: { enabled: true }, take: 1 });
  const merged = profiles.reduce<ProfileCriteria>((into, profile) => {
    const criteria = criteriaFrom(profile);
    const together = (key: keyof ProfileCriteria) => [...into[key], ...criteria[key].filter((value) => !into[key].some((seen) => seen.toLowerCase() === value.toLowerCase()))];
    return { ...into, ...Object.fromEntries((Object.keys(into) as (keyof ProfileCriteria)[]).map((key) => [key, together(key)])) } as ProfileCriteria;
  }, { titles: [], altTitles: [], requiredKeywords: [], excludedKeywords: [], requiredTech: [], preferredTech: [], excludedTech: [], seniority: [], employmentTypes: [], remoteCountries: [], companyBlacklist: [], companyWhitelist: [], industries: [] });
  const only = profiles.length === 1 ? criteriaFrom(profiles[0]!) : merged;
  const salary = profiles.length === 1 ? profiles[0]!.salaryMin : null;
  const currency = profiles.length === 1 ? profiles[0]!.currency : "";
  return criteriaText(only, salary, currency);
}

const screen: ScreenFn = async (posting, { signal }) => {
  const provider = await getProviderForTask("screen-posting");
  const [criteria, profile] = await Promise.all([screenCriteria(), loadProfile()]);
  const { data } = await screenPosting(provider, { posting: postingText(posting), title: posting.title, company: posting.company, criteria, profile }, { creativity: "FAITHFUL", strict: true, language: null, signal });
  return data;
};

/** The required technologies the assessment found no evidence for, for the mandatory rules. */
function missingRequiredTech(requiredTech: readonly string[], requirements: { requirement: string; status: string }[]): string[] {
  return requiredTech.filter((tech) => {
    const needle = tech.trim().toLowerCase();
    return requirements.some((requirement) => requirement.requirement.toLowerCase().includes(needle) && (requirement.status === "MISSING_EVIDENCE" || requirement.status === "CONFIRMED_GAP"));
  });
}

const assess: AssessFn = async (postingId, { posting, criteria, signal }) => {
  const provider = await getProviderForTask("assess-job");
  const [profile, achievements] = await Promise.all([
    loadProfile(),
    listAchievements().then((rows) =>
      rows
        .filter((row) => row.status !== "REJECTED")
        .map(({ id, title, description }) => ({ id, title, summary: description })),
    ),
  ]);
  const { data, promptVersion } = await assessJob(
    provider,
    { posting: postingText(posting), title: posting.title, company: posting.company, location: posting.place, profile, achievements },
    { creativity: "FAITHFUL", strict: true, language: null, signal },
  );
  const rule = checkMandatoryRules({
    profile: { remoteCountries: criteria.remoteCountries },
    posting: { remote: posting.remote, place: posting.place, salaryText: posting.salary, title: posting.title },
    assessment: { dimensions: data.dimensions },
    missingRequiredTech: missingRequiredTech(criteria.requiredTech, data.requirements),
  });
  const row = await persistAssessment({ postingId, assessment: data, mandatoryRules: rule ? [rule] : [], promptVersion });
  const decision: Exclude<AssessmentDecision, "PENDING"> = row.decision === "PENDING" ? "WEAK_MATCH" : row.decision;
  return {
    decision,
    score: row.score ?? 0,
    confidence: row.confidence === "HIGH" ? "HIGH" : row.confidence === "LOW" ? "LOW" : "MEDIUM",
    reasons: listOf(row.reasons),
    assessedWith: row.assessedWith,
    dimensions: row.dimensions ?? undefined,
    requirements: row.requirements ?? undefined,
    critique: row.critique ?? undefined,
  };
};

const EVERY_MINUTE_MS = 60_000;

// On globalThis, so the dev server's hot reloads keep the one timer.
const globalForDiscovery = globalThis as unknown as { discoveryTimer?: ReturnType<typeof setTimeout> };

/** Runs the profiles whose schedule has come due, once a minute. */
function startDiscoverySchedule(): void {
  if (globalForDiscovery.discoveryTimer) return;
  const check = () => void runDueProfiles().catch((error: unknown) => logServerError("discovery schedule", error));
  const tick = () => {
    // Don't keep the process alive just for this.
    globalForDiscovery.discoveryTimer = setTimeout(tick, EVERY_MINUTE_MS);
    globalForDiscovery.discoveryTimer.unref?.();
    check();
  };
  tick();
}

/** Wires the AI stages in and starts the schedules. Called once at startup. */
export function activateDiscoveryHooks(): void {
  setPipelineHooks({ screen, assess });
  startDiscoverySchedule();
}
