import "server-only";

import { z } from "zod";

import type { JobSearchProfile, Prisma } from "@/generated/prisma/client";
import { SearchScheduleKind } from "@/generated/prisma/enums";
import { JOB_SOURCES, searchQuerySchema } from "@/lib/job-search/search";
import { prisma } from "@/lib/prisma";

// Search profiles (master.md §2.2): named, criteria-rich searches the
// discovery engine runs on a schedule. The criteria live in the
// JobSearchProfile's JSON columns; reads are lenient, so a hand-edited or
// older row never breaks a run.

/** A JSON list of non-empty strings, as the criteria columns are stored. */
export const stringListSchema = z.array(z.string().trim().min(1).max(300)).max(200);

/** Reads a stored JSON value as a list of strings; anything unexpected reads as none. */
export function listOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "").map((entry) => entry.trim());
}

/** The JSON list columns of a profile, as one criteria object the filters and prompts read. */
export const profileCriteriaSchema = z.object({
  titles: stringListSchema,
  altTitles: stringListSchema,
  requiredKeywords: stringListSchema,
  excludedKeywords: stringListSchema,
  requiredTech: stringListSchema,
  preferredTech: stringListSchema,
  excludedTech: stringListSchema,
  seniority: stringListSchema,
  employmentTypes: stringListSchema,
  remoteCountries: stringListSchema,
  companyBlacklist: stringListSchema,
  companyWhitelist: stringListSchema,
  industries: stringListSchema,
});
export type ProfileCriteria = z.output<typeof profileCriteriaSchema>;

export const EMPTY_CRITERIA: ProfileCriteria = {
  titles: [],
  altTitles: [],
  requiredKeywords: [],
  excludedKeywords: [],
  requiredTech: [],
  preferredTech: [],
  excludedTech: [],
  seniority: [],
  employmentTypes: [],
  remoteCountries: [],
  companyBlacklist: [],
  companyWhitelist: [],
  industries: [],
};

/** Reads a profile's JSON columns back as criteria, never throwing. */
export function criteriaFrom(profile: JobSearchProfile): ProfileCriteria {
  return {
    titles: listOf(profile.titles),
    altTitles: listOf(profile.altTitles),
    requiredKeywords: listOf(profile.requiredKeywords),
    excludedKeywords: listOf(profile.excludedKeywords),
    requiredTech: listOf(profile.requiredTech),
    preferredTech: listOf(profile.preferredTech),
    excludedTech: listOf(profile.excludedTech),
    seniority: listOf(profile.seniority),
    employmentTypes: listOf(profile.employmentTypes),
    remoteCountries: listOf(profile.remoteCountries),
    companyBlacklist: listOf(profile.companyBlacklist),
    companyWhitelist: listOf(profile.companyWhitelist),
    industries: listOf(profile.industries),
  };
}

// The pipeline's stages, spelled the way JobAssessment.stage spells them.
// Every one can be left out of a run with the query's skipStages.
export const DISCOVERY_STAGES = ["DETERMINISTIC", "KEYWORD", "SCREENED", "ASSESSED"] as const;
export type DiscoveryStage = (typeof DISCOVERY_STAGES)[number];

/**
 * The profile's query JSON: the base search (searchQuerySchema) plus the
 * pipeline's knobs. `externalSourceId` asks an external source (a Setting
 * row "discovery:external:<id>", see src/lib/discovery/external.ts) instead
 * of the built-in `source` column, since PostingSource only names built-ins.
 */
export const profileQuerySchema = searchQuerySchema.extend({
  externalSourceId: z.string().trim().min(1).max(100).optional(),
  skipStages: z.array(z.enum(DISCOVERY_STAGES)).max(DISCOVERY_STAGES.length).default([]),
});
export type ProfileQuery = z.output<typeof profileQuerySchema>;

/** How remote work may be, as the profile's remotePreference column spells it. */
export const REMOTE_PREFERENCES = ["REMOTE_ONLY", "REMOTE_OR_HYBRID", "ONSITE_OK"] as const;
export const remotePreferenceSchema = z.enum(REMOTE_PREFERENCES);

// ─── Cron ────────────────────────────────────────────────────────────────────
// A tiny 5-field cron matcher, hand-rolled so discovery needs no dependency:
// minute, hour, day of month, month, day of week; *, lists, ranges and steps.

const CRON_FIELDS: readonly { min: number; max: number }[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
];

/** The values one cron field stands for, or null when it isn't a valid field. */
function cronFieldValues(field: string, min: number, max: number): number[] | null {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const hasStep = part.includes("/");
    const [bounds = "", step = "1"] = part.split("/");
    if (!/^\d+$|^\*$|^\d+-\d+$/.test(bounds) || !/^\d+$/.test(step)) return null;
    const stride = Number(step);
    if (stride < 1) return null;
    let from = min;
    let to = max;
    if (bounds !== "*") {
      const [start = "", end] = bounds.split("-");
      from = Number(start);
      if (end === undefined) {
        // "5/10" means 5, 15, 25... up to the field's top.
        to = hasStep ? max : from;
      } else {
        to = Number(end);
      }
      if (from < min || to > max || from > to) return null;
    }
    for (let value = from; value <= to; value += stride) values.add(value);
  }
  return [...values];
}

/** Whether the string is a 5-field cron expression this matcher understands. */
export function validCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field, index) => cronFieldValues(field, CRON_FIELDS[index].min, CRON_FIELDS[index].max) !== null);
}

export type CronClock = { minute: number; hour: number; dayOfMonth: number; month: number; dayOfWeek: number };

/** Whether a wall clock (as zonedParts reports it) matches a 5-field cron expression; day of week: 0 and 7 are Sunday. */
export function cronMatches(expression: string, clock: CronClock): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const values = fields.map((field, index) => cronFieldValues(field, CRON_FIELDS[index].min, CRON_FIELDS[index].max));
  if (values.some((entry) => entry === null)) return false;
  const [minutes, hours, days, months, weekdays] = values as number[][];
  // 0 and 7 are both Sunday, whichever way either side spells it.
  const weekday = clock.dayOfWeek === 7 ? 0 : clock.dayOfWeek;
  const weekdayList = weekdays.map((value) => (value === 7 ? 0 : value));
  // Vixie cron: when both day fields are restricted, either one may match.
  const bothDays = fields[2] !== "*" && fields[4] !== "*";
  const dayOk = bothDays ? days.includes(clock.dayOfMonth) || weekdayList.includes(weekday) : days.includes(clock.dayOfMonth) && weekdayList.includes(weekday);
  return minutes.includes(clock.minute) && hours.includes(clock.hour) && months.includes(clock.month) && dayOk;
}

export const cronSchema = z
  .string()
  .trim()
  .max(100)
  .refine((expression) => expression === "" || validCron(expression), {
    error: "A cron expression is five fields: minute, hour, day of month, month and day of week.",
  });

// ─── Wall clocks in the profile's time zone ─────────────────────────────────

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const formatters = new Map<string, Intl.DateTimeFormat>();

/** The parts of `date` as a wall clock in `timeZone` (IANA name), or the server's zone when it's empty; the same shape cronMatches reads. */
export function zonedParts(date: Date, timeZone = ""): { year: number; month: number; dayOfMonth: number; hour: number; minute: number; dayOfWeek: number } {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      dayOfMonth: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      dayOfWeek: date.getDay(),
    };
  }
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const partOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const dayOfWeek = WEEKDAY_NAMES.indexOf(partOf("weekday"));
  return {
    year: Number(partOf("year")),
    month: Number(partOf("month")),
    dayOfMonth: Number(partOf("day")),
    hour: Number(partOf("hour")),
    minute: Number(partOf("minute")),
    dayOfWeek: dayOfWeek === -1 ? 0 : dayOfWeek,
  };
}

// ─── Create and update ───────────────────────────────────────────────────────

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Everything a create or update asks for, validated before it reaches the database. */
export const searchProfileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    enabled: z.boolean().default(true),
    source: z.enum(JOB_SOURCES),
    query: profileQuerySchema,
    criteria: profileCriteriaSchema,
    remotePreference: remotePreferenceSchema.default("REMOTE_OR_HYBRID"),
    salaryMin: z.number().int().min(0).max(10_000_000).nullable().default(null),
    salaryMax: z.number().int().min(0).max(10_000_000).nullable().default(null),
    currency: z.string().trim().max(3).default(""),
    companySize: z
      .string()
      .trim()
      .max(50)
      .refine((size) => size === "" || /^\d+(-\d+)?$/.test(size), { error: "Use a range like 50-200, or one number." })
      .default(""),
    startupOnly: z.boolean().default(false),
    timeZone: z
      .string()
      .trim()
      .max(100)
      .refine(validZone, { error: "Use an IANA time zone name, e.g. Europe/Berlin, or leave it empty for the server's." })
      .default(""),
    scheduleKind: z.enum(SearchScheduleKind).default(SearchScheduleKind.DAILY),
    cron: cronSchema.default(""),
    maxJobsPerRun: z.number().int().min(1).max(100).default(20),
  })
  .refine((input) => input.salaryMax === null || input.salaryMin === null || input.salaryMax >= input.salaryMin, {
    error: "The salary maximum can't be below the minimum.",
    path: ["salaryMax"],
  })
  .refine((input) => input.scheduleKind !== SearchScheduleKind.CRON || input.cron.trim() !== "", {
    error: "A CRON schedule needs a cron expression.",
    path: ["cron"],
  });
export type SearchProfileInput = z.output<typeof searchProfileInputSchema>;
export type SearchProfileParams = z.input<typeof searchProfileInputSchema>;

function dataOf(input: SearchProfileInput): Prisma.JobSearchProfileUncheckedCreateInput {
  const criteria = input.criteria;
  return {
    name: input.name,
    enabled: input.enabled,
    source: input.source,
    query: input.query as Prisma.InputJsonValue,
    titles: criteria.titles,
    altTitles: criteria.altTitles,
    requiredKeywords: criteria.requiredKeywords,
    excludedKeywords: criteria.excludedKeywords,
    requiredTech: criteria.requiredTech,
    preferredTech: criteria.preferredTech,
    excludedTech: criteria.excludedTech,
    seniority: criteria.seniority,
    employmentTypes: criteria.employmentTypes,
    remoteCountries: criteria.remoteCountries,
    companyBlacklist: criteria.companyBlacklist,
    companyWhitelist: criteria.companyWhitelist,
    industries: criteria.industries,
    remotePreference: input.remotePreference,
    salaryMin: input.salaryMin,
    salaryMax: input.salaryMax,
    currency: input.currency,
    companySize: input.companySize,
    startupOnly: input.startupOnly,
    timeZone: input.timeZone,
    scheduleKind: input.scheduleKind,
    cron: input.cron,
    maxJobsPerRun: input.maxJobsPerRun,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/** Every search profile, oldest first. */
export async function listProfiles(): Promise<JobSearchProfile[]> {
  return prisma.jobSearchProfile.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getProfile(id: string): Promise<JobSearchProfile | null> {
  return prisma.jobSearchProfile.findUnique({ where: { id } });
}

/** Creates a profile; the input is parsed here too, so direct callers can't store an invalid row. */
export async function createProfile(input: SearchProfileParams): Promise<JobSearchProfile> {
  return prisma.jobSearchProfile.create({ data: dataOf(searchProfileInputSchema.parse(input)) });
}

/** Rewrites a profile's criteria wholesale; null when there's none to rewrite. */
export async function updateProfile(id: string, input: SearchProfileParams): Promise<JobSearchProfile | null> {
  const existing = await prisma.jobSearchProfile.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;
  return prisma.jobSearchProfile.update({ where: { id }, data: dataOf(searchProfileInputSchema.parse(input)) });
}

export async function deleteProfile(id: string): Promise<boolean> {
  const { count } = await prisma.jobSearchProfile.deleteMany({ where: { id } });
  return count > 0;
}

/** Turns a profile on or off; null when there's none. */
export async function setEnabled(id: string, enabled: boolean): Promise<JobSearchProfile | null> {
  const { count } = await prisma.jobSearchProfile.updateMany({ where: { id }, data: { enabled } });
  if (count === 0) return null;
  return getProfile(id);
}

// ─── Scheduling (master.md §2.3) ─────────────────────────────────────────────

const HOUR_MS = 3_600_000;
// A cron run looks back at most this far, so a long downtime still runs at the next match.
const CRON_CATCH_UP_MS = 36 * HOUR_MS;

/** Enabled profiles whose schedule has come due by `now`, oldest first. */
export async function dueProfiles(now: Date = new Date()): Promise<JobSearchProfile[]> {
  const profiles = await prisma.jobSearchProfile.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  return profiles.filter((profile) => isDue(profile, now));
}

function isDue(profile: JobSearchProfile, now: Date): boolean {
  // A profile that never ran is due at once.
  if (!profile.lastRunAt) return true;
  const elapsed = now.getTime() - profile.lastRunAt.getTime();
  switch (profile.scheduleKind) {
    case "HOURLY":
      return elapsed >= HOUR_MS;
    case "EVERY_6_HOURS":
      return elapsed >= 6 * HOUR_MS;
    case "DAILY":
      return elapsed >= 24 * HOUR_MS;
    case "WEEKDAYS":
      return weekdayDue(profile.lastRunAt, now, profile.timeZone);
    case "CRON":
      return cronDue(profile.cron, profile.lastRunAt, now, profile.timeZone);
  }
}

/** One run per weekday: due on a weekday the last run didn't touch, in the profile's zone. */
function weekdayDue(lastRunAt: Date, now: Date, timeZone: string): boolean {
  const nowParts = zonedParts(now, timeZone);
  if (nowParts.dayOfWeek < 1 || nowParts.dayOfWeek > 5) return false;
  const ranParts = zonedParts(lastRunAt, timeZone);
  return nowParts.year !== ranParts.year || nowParts.month !== ranParts.month || nowParts.dayOfMonth !== ranParts.dayOfMonth;
}

/** Due when a minute the cron names has passed since the last run. */
function cronDue(cron: string, lastRunAt: Date, now: Date, timeZone: string): boolean {
  // An expression the validator doesn't know never comes due; the input schema refuses one anyway.
  if (!validCron(cron)) return false;
  const from = Math.max(lastRunAt.getTime() + 60_000, now.getTime() - CRON_CATCH_UP_MS);
  for (let time = Math.ceil(from / 60_000) * 60_000; time <= now.getTime(); time += 60_000) {
    if (cronMatches(cron, zonedParts(new Date(time), timeZone))) return true;
  }
  return false;
}
