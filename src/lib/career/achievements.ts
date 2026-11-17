import "server-only";

import { z } from "zod";

import type { CareerAchievement } from "@/generated/prisma/client";
import { EvidenceStatus } from "@/generated/prisma/enums";
import { nextSort } from "@/lib/profile-entries";
import { prisma } from "@/lib/prisma";
import { readTargetPrefs } from "@/lib/career/targets";

// The evidence-backed achievement library (master.md §1.2): what the user has
// done, with the sources that back it. The evidence hierarchy (master.md §13)
// lives here: AI callers may only store IMPORTED or NEEDS_CLARIFICATION;
// VERIFIED, USER_CONFIRMED and REJECTED are the user's to set, through
// setStatus and promoteToVerified.

/** Another phrasing of an achievement, e.g. an ATS-safe or business-first retelling. */
export const achievementVersionSchema = z.object({
  kind: z.enum(["TECHNICAL", "BUSINESS", "LEADERSHIP", "ATS", "PROJECT", "OTHER"]),
  text: z.string().max(2_000),
});
export type AchievementVersion = z.output<typeof achievementVersionSchema>;

/** Create/update input. Everything is optional: create falls back to empty defaults, update keeps what is left out. */
export const achievementInputSchema = z.object({
  title: z.string().max(300).optional(),
  description: z.string().max(2_000).optional(),
  detail: z.string().max(8_000).optional(),
  company: z.string().max(200).optional(),
  position: z.string().max(200).optional(),
  project: z.string().max(200).optional(),
  technologies: z.array(z.string().max(100)).max(20).optional(),
  problem: z.string().max(2_000).optional(),
  action: z.string().max(2_000).optional(),
  outcome: z.string().max(2_000).optional(),
  businessImpact: z.string().max(2_000).optional(),
  metrics: z.array(z.string().max(300)).max(10).optional(),
  scale: z.string().max(200).optional(),
  ownership: z.string().max(100).optional(),
  complexity: z.string().max(200).optional(),
  evidenceUrl: z.string().max(1_000).optional(),
  evidenceNotes: z.string().max(2_000).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  skills: z.array(z.string().max(100)).max(30).optional(),
  experienceId: z.string().max(50).nullable().optional(),
  versions: z.array(achievementVersionSchema).max(10).optional(),
  status: z.enum(EvidenceStatus).optional(),
});
export type AchievementInput = z.output<typeof achievementInputSchema>;

/** Statuses AI callers may store (master.md §13); the rest belong to the user. */
const aiStatuses: readonly EvidenceStatus[] = [EvidenceStatus.IMPORTED, EvidenceStatus.NEEDS_CLARIFICATION];

/** Throws for statuses only the user may set, so AI paths can never verify or reject evidence. */
export function assertUserStatus(status: EvidenceStatus): void {
  if (!aiStatuses.includes(status)) throw new Error(`Only the user can set an achievement to ${status}.`);
}

/** A stored achievement with its JSON columns read back as data. */
export type AchievementView = Omit<CareerAchievement, "technologies" | "metrics" | "tags" | "skills" | "versions"> & {
  technologies: string[];
  metrics: string[];
  tags: string[];
  skills: string[];
  versions: AchievementVersion[];
};

const stringList = z.array(z.string()).catch([]);
const versionList = z.array(achievementVersionSchema).catch([]);

function toView(row: CareerAchievement): AchievementView {
  return {
    ...row,
    technologies: stringList.parse(row.technologies),
    metrics: stringList.parse(row.metrics),
    tags: stringList.parse(row.tags),
    skills: stringList.parse(row.skills),
    versions: versionList.parse(row.versions),
  };
}

/** The model's empty defaults for omitted fields (CareerAchievement.@default). */
const emptyAchievement = {
  title: "",
  description: "",
  detail: "",
  company: "",
  position: "",
  project: "",
  technologies: [] as string[],
  problem: "",
  action: "",
  outcome: "",
  businessImpact: "",
  metrics: [] as string[],
  scale: "",
  ownership: "",
  complexity: "",
  evidenceUrl: "",
  evidenceNotes: "",
  tags: [] as string[],
  skills: [] as string[],
  experienceId: null as string | null,
  versions: [] as AchievementVersion[],
};

/** Drops keys left as undefined, so they cannot override defaults or stored values. */
function defined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** Creates an achievement, last in the list. `origin` says where it came from, e.g. "resume" or "doc:abc". */
export async function createAchievement(input: AchievementInput, { origin }: { origin: string }): Promise<AchievementView> {
  const status = input.status ?? EvidenceStatus.IMPORTED;
  assertUserStatus(status);
  const row = await prisma.careerAchievement.create({
    data: { ...emptyAchievement, ...defined(input), status, origin, sort: await nextSort(prisma.careerAchievement) },
  });
  return toView(row);
}

/** Updates the given fields. The status guard keeps AI paths out of the user's statuses. */
export async function updateAchievement(id: string, input: AchievementInput): Promise<AchievementView> {
  const data = defined(input);
  if (data.status !== undefined) assertUserStatus(data.status);
  return toView(await prisma.careerAchievement.update({ where: { id }, data }));
}

export async function deleteAchievement(id: string): Promise<void> {
  await prisma.careerAchievement.delete({ where: { id } });
}

/** The user checked the achievement against a source; the only path to VERIFIED. */
export async function promoteToVerified(id: string): Promise<AchievementView> {
  return toView(await prisma.careerAchievement.update({ where: { id }, data: { status: EvidenceStatus.VERIFIED } }));
}

/** Sets any status as the user says; AI callers go through createAchievement and updateAchievement instead. */
export async function setStatus(id: string, status: EvidenceStatus): Promise<AchievementView> {
  return toView(await prisma.careerAchievement.update({ where: { id }, data: { status } }));
}

export async function getAchievement(id: string): Promise<AchievementView | null> {
  const row = await prisma.careerAchievement.findUnique({ where: { id } });
  return row ? toView(row) : null;
}

/** Sets the list order to the given ids. */
export async function reorderAchievements(ids: string[]): Promise<void> {
  await prisma.$transaction(ids.map((id, index) => prisma.careerAchievement.update({ where: { id }, data: { sort: index } })));
}

/** Keywords achievements must mention for a target: its own keywords, or the words of its title. */
async function targetKeywords(title: string): Promise<string[]> {
  const target = await prisma.careerTarget.findFirst({ where: { title: { equals: title, mode: "insensitive" } } });
  if (target) {
    const { keywords } = readTargetPrefs(target.preferences);
    if (keywords.length > 0) return keywords;
  }
  return title.split(/\s+/).filter(Boolean);
}

/** Whether the achievement mentions the query (title/description/tags) and the target's keywords. */
function matches(achievement: AchievementView, query: string | undefined, keywords: string[] | undefined): boolean {
  const text = [achievement.title, achievement.description, achievement.tags.join(" ")].join(" ").toLowerCase();
  if (query && !text.includes(query.toLowerCase())) return false;
  if (keywords) {
    const withSkills = `${text} ${achievement.skills.join(" ")}`.toLowerCase();
    if (!keywords.some((word) => withSkills.includes(word.toLowerCase()))) return false;
  }
  return true;
}

/** The library in list order, filtered. Simple contains matching; no vector search. */
export async function listAchievements(
  { status, skill, targetTitle, query }: { status?: EvidenceStatus; skill?: string; targetTitle?: string; query?: string } = {},
): Promise<AchievementView[]> {
  const rows = await prisma.careerAchievement.findMany({
    where: {
      ...(status ? { status } : {}),
      // Skill names are unique, so an exact match on the skills list is enough.
      ...(skill ? { skills: { array_contains: skill } } : {}),
    },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
  });
  const keywords = targetTitle ? await targetKeywords(targetTitle) : undefined;
  return rows.map(toView).filter((achievement) => matches(achievement, query, keywords));
}

/** Compact JSON for AI prompts: enough to pick evidence, no internal fields beyond the id. */
export async function achievementsForPrompt(ids: string[]): Promise<string> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return "[]";
  const rows = await prisma.careerAchievement.findMany({
    where: { id: { in: unique } },
    select: { id: true, title: true, company: true, metrics: true, technologies: true, status: true },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
  });
  return JSON.stringify(rows);
}

/** Which of the given ids exist and are not REJECTED, so callers can filter AI-claimed evidence ids. */
export async function verifiedAchievementIds(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await prisma.careerAchievement.findMany({ where: { id: { in: unique } }, select: { id: true, status: true } });
  return rows.filter((row) => row.status !== EvidenceStatus.REJECTED).map((row) => row.id);
}
