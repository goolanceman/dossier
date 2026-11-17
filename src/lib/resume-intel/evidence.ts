import "server-only";

import { EvidenceStatus } from "@/generated/prisma/enums";
import { getAchievement } from "@/lib/career/achievements";
import { prisma } from "@/lib/prisma";

// The claim-to-evidence map (master.md §5.3, §13): which achievements a
// tailored document's units are backed by. Numbers in a bullet may only come
// from evidence, and validateTailoredUnits is the check that enforces it.

/** Which achievements a document used. */
export type EvidenceView = {
  id: string;
  achievementId: string;
  unitId: string;
  title: string;
  status: EvidenceStatus;
};

/**
 * Replaces the document's evidence set with the given mappings. Achievements
 * that don't exist are skipped: a mapping pointing nowhere would break every
 * later join, and an achievement deleted later drops out by the cascade.
 */
export async function mapDocumentEvidence(documentId: string, mappings: { achievementId: string; unitId: string }[]): Promise<number> {
  const unique = [...new Set(mappings.map(({ achievementId, unitId }) => `${achievementId}\n${unitId}`))].map((key) => {
    const [achievementId, unitId] = key.split("\n");
    return { achievementId: achievementId!, unitId: unitId! };
  });
  const known = await Promise.all(unique.map(async (mapping) => ((await getAchievement(mapping.achievementId)) ? mapping : null)));
  const stored = known.filter((mapping) => mapping !== null);
  await prisma.documentEvidence.deleteMany({ where: { documentId } });
  if (stored.length === 0) return 0;
  const { count } = await prisma.documentEvidence.createMany({ data: stored.map((mapping) => ({ ...mapping, documentId })) });
  return count;
}

/** The document's evidence, with the achievement's title and status for display. */
export async function evidenceForDocument(documentId: string): Promise<EvidenceView[]> {
  const rows = await prisma.documentEvidence.findMany({
    where: { documentId },
    include: { achievement: { select: { title: true, status: true } } },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    achievementId: row.achievementId,
    unitId: row.unitId,
    title: row.achievement.title,
    status: row.achievement.status,
  }));
}

// Date shapes a number can appear in without being a claimed metric. Kept
// deliberately simple: dates must not force evidence, anything else with a
// digit must have it.
const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/g, // 2026-01-31
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, // 31/01/2026
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{4}\b/gi, // January 2026
  /\b(?:19|20)\d{2}\b/g, // a bare year, including ranges like 2024-2025
];

/**
 * Checks that a tailored document's numbers come from evidence (master.md
 * §5.3, §13). In strict mode every unit whose text still has a digit after
 * the date shapes above are removed needs at least one evidence mapping for
 * its unitId. Outside strict mode nothing is flagged: the caller only wants
 * the violations it means to enforce. The unit's own id is never scanned;
 * ids like "paragraph:1" carry numbering, not claims.
 */
export function validateTailoredUnits(
  units: { id: string; text: string }[],
  evidence: { achievementId: string; unitId: string }[],
  strict: boolean,
): { violations: { unitId: string; problem: string }[] } {
  if (!strict) return { violations: [] };
  const evidenced = new Set(evidence.map((mapping) => mapping.unitId));
  const violations: { unitId: string; problem: string }[] = [];
  for (const unit of units) {
    const withoutDates = DATE_PATTERNS.reduce((text, pattern) => text.replace(pattern, " "), unit.text);
    if (!/\d/.test(withoutDates)) continue;
    if (evidenced.has(unit.id)) continue;
    violations.push({
      unitId: unit.id,
      problem: "This unit states numbers, but no evidence is mapped to it. Map an achievement or remove the numbers.",
    });
  }
  return { violations };
}
