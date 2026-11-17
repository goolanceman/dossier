import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchScheduleKind } from "@/generated/prisma/enums";
import { createTestClient, resetDatabase } from "@/test/db";

import { cronMatches, createProfile, criteriaFrom, deleteProfile, dueProfiles, getProfile, listProfiles, setEnabled, updateProfile, zonedParts } from "./profile";

// The profile helpers run against the test database.
const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

const input = {
  name: "Senior Node.js Backend Engineer",
  source: "JSEARCH" as const,
  query: { keywords: "node.js backend", place: "Berlin", country: "de", radiusKm: 50 as const, remoteOnly: false, postedWithin: "week" as const },
  criteria: {
    titles: ["Senior Backend Engineer"],
    altTitles: ["Staff Engineer"],
    requiredKeywords: ["TypeScript"],
    excludedKeywords: ["PHP"],
    requiredTech: ["Node.js"],
    preferredTech: ["Kafka"],
    excludedTech: ["Rails"],
    seniority: ["senior"],
    employmentTypes: ["FULL_TIME"],
    remoteCountries: ["de"],
    companyBlacklist: ["Blackco"],
    companyWhitelist: ["Northwind"],
    industries: ["fintech"],
  },
  salaryMin: 60000,
  salaryMax: 85000,
  currency: "EUR",
  companySize: "50-200",
  startupOnly: true,
  timeZone: "Europe/Berlin",
  scheduleKind: "HOURLY" as const,
  cron: "",
  maxJobsPerRun: 10,
  enabled: true,
};

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

describe("profile CRUD", () => {
  it("creates a profile with its criteria in the JSON columns and reads it back", async () => {
    const created = await createProfile(input);
    expect(created).toMatchObject({ name: "Senior Node.js Backend Engineer", source: "JSEARCH", scheduleKind: "HOURLY", salaryMin: 60000, maxJobsPerRun: 10 });
    expect(created.titles).toEqual(["Senior Backend Engineer"]);
    expect(created.requiredTech).toEqual(["Node.js"]);
    expect((created.query as typeof input.query).keywords).toBe("node.js backend");

    const read = await getProfile(created.id);
    expect(read?.id).toBe(created.id);
    expect(criteriaFrom(read!)).toEqual(input.criteria);
    expect(await getProfile("nope")).toBeNull();
  });

  it("updates, toggles and deletes", async () => {
    const created = await createProfile(input);
    const updated = await updateProfile(created.id, { ...input, name: "Renamed", maxJobsPerRun: 5, salaryMax: null });
    expect(updated).toMatchObject({ name: "Renamed", maxJobsPerRun: 5, salaryMax: null });
    expect(await updateProfile("nope", input)).toBeNull();

    expect((await setEnabled(created.id, false))?.enabled).toBe(false);
    expect((await setEnabled(created.id, true))?.enabled).toBe(true);
    expect(await setEnabled("nope", true)).toBeNull();

    expect(await deleteProfile(created.id)).toBe(true);
    expect(await deleteProfile(created.id)).toBe(false);
    expect(await listProfiles()).toEqual([]);
  });

  it("lists every profile, oldest first", async () => {
    const first = await createProfile(input);
    const second = await createProfile({ ...input, name: "Second" });
    expect(await listProfiles()).toEqual([first, second]);
  });

  it("refuses inputs that don't validate", async () => {
    await expect(createProfile({ ...input, scheduleKind: "CRON" as const })).rejects.toThrow();
    await expect(createProfile({ ...input, scheduleKind: "CRON" as const, cron: "0 9 * * 1-5" })).resolves.toBeTruthy();
    await expect(createProfile({ ...input, scheduleKind: "CRON" as const, cron: "daily" })).rejects.toThrow("cron");
    await expect(createProfile({ ...input, maxJobsPerRun: 0 })).rejects.toThrow();
    await expect(createProfile({ ...input, salaryMin: 90000, salaryMax: 50000 })).rejects.toThrow("salary");
    await expect(createProfile({ ...input, source: "LINKEDIN" as never })).rejects.toThrow();
    await expect(createProfile({ ...input, companySize: "about fifty" })).rejects.toThrow();
    await expect(createProfile({ ...input, timeZone: "Berlin" })).rejects.toThrow();
  });
});

describe("cronMatches", () => {
  const clock = { minute: 30, hour: 9, dayOfMonth: 17, month: 11, dayOfWeek: 2 }; // Tuesday 17 Nov, 09:30
  it("matches the five fields with lists, ranges, steps and stars", () => {
    expect(cronMatches("30 9 * * *", clock)).toBe(true);
    expect(cronMatches("*/15 9 * * *", clock)).toBe(true);
    expect(cronMatches("0,30 8-9 * * 1-5", clock)).toBe(true);
    expect(cronMatches("30 9 17 11 *", clock)).toBe(true);
    expect(cronMatches("30 9 * * 1", clock)).toBe(false);
    expect(cronMatches("0 9 * * *", clock)).toBe(false);
  });

  it("counts 0 and 7 as Sunday, and lets either restricted day field match", () => {
    const sunday = { ...clock, dayOfMonth: 15, dayOfWeek: 0 };
    expect(cronMatches("30 9 * * 0", sunday)).toBe(true);
    expect(cronMatches("30 9 * * 7", sunday)).toBe(true);
    // Both day fields restricted: either one may match (Vixie cron).
    expect(cronMatches("30 9 15 * *", sunday)).toBe(true);
    expect(cronMatches("30 9 15 * 2", sunday)).toBe(true);
    expect(cronMatches("30 9 20 * 2", clock)).toBe(true);
    expect(cronMatches("30 9 20 * 3", clock)).toBe(false);
  });

  it("refuses what it can't read", () => {
    expect(cronMatches("daily", clock)).toBe(false);
    expect(cronMatches("60 9 * * *", clock)).toBe(false);
    expect(cronMatches("30 9 * *", clock)).toBe(false);
    expect(cronMatches("*/0 9 * * *", clock)).toBe(false);
  });
});

describe("zonedParts", () => {
  it("reads a wall clock in the zone, or the server's when it's empty", () => {
    const utc = new Date("2026-11-17T00:30:00Z");
    // Berlin is an hour ahead in November.
    expect(zonedParts(utc, "Europe/Berlin")).toEqual({ year: 2026, month: 11, dayOfMonth: 17, hour: 1, minute: 30, dayOfWeek: 2 });
    const local = zonedParts(utc);
    expect(local).toEqual({ year: expect.any(Number), month: expect.any(Number), dayOfMonth: expect.any(Number), hour: expect.any(Number), minute: expect.any(Number), dayOfWeek: expect.any(Number) });
  });
});

describe("dueProfiles", () => {
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const at = (iso: string) => new Date(iso);

  const addProfile = async (
    name: string,
    data: { scheduleKind?: SearchScheduleKind; lastRunAt?: Date | null; cron?: string; enabled?: boolean; timeZone?: string } = {},
  ) =>
    prisma().jobSearchProfile.create({
      data: {
        name,
        source: "JSEARCH",
        query: {},
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
        scheduleKind: data.scheduleKind ?? SearchScheduleKind.HOURLY,
        lastRunAt: data.lastRunAt,
        cron: data.cron,
        enabled: data.enabled,
        timeZone: data.timeZone,
      },
      select: { id: true, name: true },
    });

  it("is due when it never ran, and not when it's off", async () => {
    await addProfile("fresh");
    await addProfile("off", { lastRunAt: null, enabled: false });
    const due = await dueProfiles(at("2026-11-17T08:00:00Z"));
    expect(due.map((profile) => profile.name)).toEqual(["fresh"]);
  });

  it("times the fixed schedules by elapsed time", async () => {
    const now = at("2026-11-17T08:00:00Z");
    await addProfile("hourly-fresh", { scheduleKind: "HOURLY", lastRunAt: new Date(now.getTime() - 30 * MINUTE) });
    await addProfile("hourly-old", { scheduleKind: "HOURLY", lastRunAt: new Date(now.getTime() - 2 * HOUR) });
    await addProfile("six-fresh", { scheduleKind: "EVERY_6_HOURS", lastRunAt: new Date(now.getTime() - 5 * HOUR) });
    await addProfile("six-old", { scheduleKind: "EVERY_6_HOURS", lastRunAt: new Date(now.getTime() - 7 * HOUR) });
    await addProfile("daily-fresh", { scheduleKind: "DAILY", lastRunAt: new Date(now.getTime() - 23 * HOUR) });
    await addProfile("daily-old", { scheduleKind: "DAILY", lastRunAt: new Date(now.getTime() - 25 * HOUR) });
    const due = await dueProfiles(now);
    expect(due.map((profile) => profile.name)).toEqual(["hourly-old", "six-old", "daily-old"]);
  });

  it("runs weekdays once a day, in the profile's time zone", async () => {
    const friday = at("2026-11-20T10:00:00Z"); // 11:00 in Berlin
    await addProfile("ran-monday", { scheduleKind: "WEEKDAYS", lastRunAt: at("2026-11-16T09:00:00Z"), timeZone: "Europe/Berlin" });
    const ranFriday = await addProfile("ran-friday", { scheduleKind: "WEEKDAYS", lastRunAt: at("2026-11-20T08:00:00Z"), timeZone: "Europe/Berlin" });
    expect((await dueProfiles(friday)).map((profile) => profile.name)).toEqual(["ran-monday"]);
    // Saturday: not due, whatever the last run was.
    await prisma().jobSearchProfile.update({ where: { id: ranFriday.id }, data: { lastRunAt: at("2026-11-19T08:00:00Z") } });
    expect(await dueProfiles(at("2026-11-21T10:00:00Z"))).toEqual([]);
  });

  it("runs a cron at the first matching minute after the last run", async () => {
    // 09:00 Berlin (08:00 UTC in November) on weekdays.
    const profile = await addProfile("cron-weekdays", { scheduleKind: "CRON", cron: "0 9 * * 1-5", lastRunAt: at("2026-11-16T08:00:00Z"), timeZone: "Europe/Berlin" });
    // Still Monday, after the run: the next match is tomorrow.
    expect((await dueProfiles(at("2026-11-16T08:30:00Z"))).map((entry) => entry.name)).toEqual([]);
    // Tuesday 09:01 Berlin: due.
    expect((await dueProfiles(at("2026-11-17T08:01:00Z"))).map((entry) => entry.name)).toEqual(["cron-weekdays"]);
    // An expression the matcher can't read never comes due.
    await prisma().jobSearchProfile.update({ where: { id: profile.id }, data: { cron: "nonsense" } });
    expect(await dueProfiles(at("2026-11-17T08:01:00Z"))).toEqual([]);
  });
});
