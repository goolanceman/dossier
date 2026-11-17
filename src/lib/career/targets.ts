import "server-only";

import { z } from "zod";

import type { CareerTarget, Prisma } from "@/generated/prisma/client";
import { nextSort } from "@/lib/profile-entries";
import { prisma } from "@/lib/prisma";

// Career directions (master.md §1.1): the roles the user is aiming at, one of
// them primary at a time. The preferences are what discovery and scoring read.

/** Per-target preferences: seniority, pay floor, remote countries, what matters, what to match. */
export const targetPrefsSchema = z.object({
  seniority: z.string().max(100).default(""),
  salaryMin: z.number().int().min(0).nullable().default(null),
  currency: z.string().max(10).default("EUR"),
  remoteCountries: z.array(z.string().max(100)).max(30).default([]),
  priorities: z.array(z.string().max(300)).max(10).default([]),
  keywords: z.array(z.string().max(100)).max(30).default([]),
});
export type TargetPrefs = z.output<typeof targetPrefsSchema>;

/** Reads the preferences column, falling back to the defaults when it does not parse. */
export function readTargetPrefs(value: Prisma.JsonValue | null): TargetPrefs {
  const parsed = targetPrefsSchema.safeParse(value);
  return parsed.success ? parsed.data : targetPrefsSchema.parse({});
}

/** Create input; preferences may come in partial and are filled from the defaults. */
export const targetInputSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(2_000).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  primary: z.boolean().optional(),
});
export type TargetInput = z.output<typeof targetInputSchema>;

/** Update input; left-out fields keep their stored values. */
export const targetUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(2_000).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  primary: z.boolean().optional(),
});
export type TargetUpdate = z.output<typeof targetUpdateSchema>;

/** A stored target with its preferences column read back as data. */
export type TargetView = Omit<CareerTarget, "preferences"> & { preferences: TargetPrefs };

function toView(row: CareerTarget): TargetView {
  return { ...row, preferences: readTargetPrefs(row.preferences) };
}

/** Fills missing preference keys from the stored value (or the defaults), then validates the whole. */
function mergedPrefs(stored: Prisma.JsonValue | null, patch: Record<string, unknown> | undefined): TargetPrefs {
  return targetPrefsSchema.parse({ ...readTargetPrefs(stored), ...(patch ?? {}) });
}

/** The only primary target, demoting the rest. */
async function demoteOthers(id: string): Promise<void> {
  await prisma.careerTarget.updateMany({ where: { primary: true, id: { not: id } }, data: { primary: false } });
}

/** Creates a target, last in the list. The first one is primary automatically. */
export async function createTarget(input: TargetInput): Promise<TargetView> {
  const first = (await prisma.careerTarget.count()) === 0;
  const primary = first || Boolean(input.primary);
  const row = await prisma.careerTarget.create({
    data: {
      title: input.title,
      summary: input.summary ?? "",
      preferences: mergedPrefs(null, input.preferences),
      primary,
      sort: await nextSort(prisma.careerTarget),
    },
  });
  if (primary && !first) await demoteOthers(row.id);
  return toView(row);
}

/** Updates the given fields. Making a target primary demotes the old one. */
export async function updateTarget(id: string, input: TargetUpdate): Promise<TargetView> {
  const existing = await prisma.careerTarget.findUnique({ where: { id }, select: { preferences: true } });
  const row = await prisma.careerTarget.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.preferences !== undefined ? { preferences: mergedPrefs(existing?.preferences ?? null, input.preferences) } : {}),
      ...(input.primary !== undefined ? { primary: input.primary } : {}),
    },
  });
  if (input.primary) await demoteOthers(row.id);
  return toView(row);
}

export async function deleteTarget(id: string): Promise<void> {
  await prisma.careerTarget.delete({ where: { id } });
}

export async function getTarget(id: string): Promise<TargetView | null> {
  const row = await prisma.careerTarget.findUnique({ where: { id } });
  return row ? toView(row) : null;
}

/** Primary first, the others in list order. */
export async function listTargets(): Promise<TargetView[]> {
  const rows = await prisma.careerTarget.findMany({ orderBy: [{ primary: "desc" }, { sort: "asc" }, { createdAt: "asc" }] });
  return rows.map(toView);
}

/** Sets the list order to the given ids. */
export async function reorderTargets(ids: string[]): Promise<void> {
  await prisma.$transaction(ids.map((id, index) => prisma.careerTarget.update({ where: { id }, data: { sort: index } })));
}
