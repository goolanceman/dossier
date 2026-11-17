import "server-only";

import type { Document, Prisma } from "@/generated/prisma/client";
import { DocumentKind, VersionCause } from "@/generated/prisma/enums";
import { unitsSchema, type Unit } from "@/lib/application-data";
import { saveVersion } from "@/lib/document-versions";
import { prisma } from "@/lib/prisma";
import type { ProfileData } from "@/lib/profile";

import { guardSources, guardUnits } from "../ai/fact-guard";
import { profileUnits } from "../ai/tasks/tailor-resume";

// The master resume (master.md §5.5): the one resume not tied to an
// application, kept as units like a tailored one so the same editing,
// printing and critique flows work on it. Critique findings are applied
// into it, so a saved version notes when that happened, and the critique
// remembers which document it was applied to (ResumeCritique.appliedDocumentId).

/**
 * The master resume's units from the profile: the same sections the document
 * shows, in the profile's own words, with the ids the app already edits by
 * (the tailoring flow's profileUnits, so every flow agrees on them).
 */
export function masterUnitsFromProfile(profile: ProfileData): Unit[] {
  return profileUnits(profile);
}

/** The master resume, the newest when several exist (old unique rules let that happen), or null when there isn't one yet. */
export async function getMasterDocument(): Promise<Document | null> {
  return prisma.document.findFirst({ where: { applicationId: null, kind: DocumentKind.RESUME }, orderBy: { updatedAt: "desc" } });
}

/** One master resume by its document id, only when it really has no application. */
export async function getMasterDocumentById(id: string): Promise<Document | null> {
  return prisma.document.findFirst({ where: { id, applicationId: null, kind: DocumentKind.RESUME } });
}

/**
 * Saves the units as the master resume: the existing one updated, or the
 * first one created (applicationId null, kind RESUME). The units as they
 * were go into a version (E8-10), and a linked critique is marked applied.
 */
export async function saveMasterDocument(units: Unit[], opts: { critiqueId?: string; themeId?: string } = {}): Promise<Document> {
  // Nothing uncheckable gets stored: the same schema every document's units answer to.
  const valid = unitsSchema.parse(units);
  const detail = opts.critiqueId ? "Applied critique findings" : "Master resume updated";
  return prisma.$transaction(async (tx) => {
    const existing = await tx.document.findFirst({ where: { applicationId: null, kind: DocumentKind.RESUME }, orderBy: { updatedAt: "desc" } });
    const data = {
      units: valid as Prisma.InputJsonValue,
      // A theme given only when meant: leaving it out keeps the saved one.
      ...(opts.themeId !== undefined ? { themeId: opts.themeId } : {}),
    };
    const document = existing
      ? await tx.document.update({ where: { id: existing.id }, data })
      : await tx.document.create({ data: { ...data, applicationId: null, kind: DocumentKind.RESUME } });
    await saveVersion(tx, document.id, valid, { cause: VersionCause.REGENERATED, detail });
    if (opts.critiqueId) await tx.resumeCritique.update({ where: { id: opts.critiqueId }, data: { appliedDocumentId: document.id } });
    return document;
  });
}

/**
 * What the fact guard can't back in units applied from critique findings
 * (master.md §5.5, §13 "zero invented facts"): the same sources the
 * tailoring flow checks against, the profile alone since a master resume
 * has no posting. The caller reverts the offending units.
 */
export function validateAppliedUnits(units: Unit[], profile: ProfileData): { unitId: string; problem: string }[] {
  return guardUnits(units, guardSources(profile, null, ""))
    .filter((unit): unit is Unit & { unverified: string[] } => (unit.unverified?.length ?? 0) > 0)
    .map((unit) => ({ unitId: unit.id, problem: `Nothing in your profile backs ${unit.unverified.join(", ")}. Fix the text or take the change back out.` }));
}
