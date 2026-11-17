import "server-only";

import type { ResumeCritique as CritiqueRow } from "@/generated/prisma/client";
import type { ResumeCritique } from "@/lib/ai/task-contracts";
import { prisma } from "@/lib/prisma";

// Resume critique persistence (master.md §5.1–5.2): findings written by the
// validated resume_critique task, kept verbatim so every recommendation stays
// checkable against the resume text stored beside it. No employer ATS score
// is invented here; the contract's own overall score is labelled an internal
// diagnostic estimate by the UI.

/** Persists a critique and returns its id. `fileName` is "" for the base resume. */
export async function saveCritique(input: {
  fileName?: string;
  content: string;
  critique: ResumeCritique;
  critiquedWith: string;
  targetId?: string;
}): Promise<string> {
  const row = await prisma.resumeCritique.create({
    data: {
      fileName: input.fileName ?? "",
      content: input.content,
      // Straight from the validated contract object; nothing is re-scored here.
      overall: input.critique.overall,
      findings: input.critique.findings,
      keywordCoverage: input.critique.keywordCoverage,
      formattingIssues: input.critique.formattingIssues,
      targetId: input.targetId ?? null,
      critiquedWith: input.critiquedWith,
    },
  });
  return row.id;
}

/** The critiques, newest first, optionally those judged against one target. */
export async function listCritiques({ targetId }: { targetId?: string } = {}): Promise<CritiqueRow[]> {
  return prisma.resumeCritique.findMany({
    where: { ...(targetId !== undefined ? { targetId } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCritique(id: string): Promise<CritiqueRow | null> {
  return prisma.resumeCritique.findUnique({ where: { id } });
}

export async function deleteCritique(id: string): Promise<void> {
  await prisma.resumeCritique.delete({ where: { id } });
}

const severityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Findings ranked for the improvements list (master.md §5.2): severity first, category second. */
export function findingsByPriority(critique: ResumeCritique): ResumeCritique["findings"] {
  return [...critique.findings].sort(
    (a, b) => (severityRank[a.severity] ?? 4) - (severityRank[b.severity] ?? 4) || a.category.localeCompare(b.category),
  );
}
