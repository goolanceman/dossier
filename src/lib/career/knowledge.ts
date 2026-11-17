import "server-only";

import { z } from "zod";

import type { KnowledgeDoc } from "@/generated/prisma/client";
import { KnowledgeDocStatus } from "@/generated/prisma/enums";
import { docFindingsSchema, type DocFindings } from "@/lib/ai/task-contracts";
import { createAchievement } from "@/lib/career/achievements";
import { prisma } from "@/lib/prisma";

// The career knowledge base (master.md §1.3): the user's documents as text,
// reviewed into findings and drafted achievements. Drafts land as IMPORTED
// and wait for the user; nothing here is ever verified (master.md §13).

/** What kind of document it is, so review prompts can frame it. */
export const docKindSchema = z.enum(["RESUME", "LINKEDIN", "PROJECT", "GITHUB", "NOTES", "CERTIFICATE", "REVIEW", "OTHER"]);
export type DocKind = z.output<typeof docKindSchema>;

/** Create input; kind, content and sourceUrl fall back to their defaults. */
export const docInputSchema = z.object({
  name: z.string().min(1).max(300),
  kind: docKindSchema.default("OTHER"),
  content: z.string().max(200_000).default(""),
  sourceUrl: z.string().max(1_000).default(""),
});
export type DocInput = z.output<typeof docInputSchema>;

/** Update input; left-out fields keep their stored values. */
export const docUpdateSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  kind: docKindSchema.optional(),
  content: z.string().max(200_000).optional(),
  sourceUrl: z.string().max(1_000).optional(),
  status: z.enum(KnowledgeDocStatus).optional(),
});
export type DocUpdate = z.output<typeof docUpdateSchema>;

/** A stored doc with its JSON columns read back as data. */
export type KnowledgeDocView = Omit<KnowledgeDoc, "findings" | "achievementIds"> & {
  findings: DocFindings | null;
  achievementIds: string[];
};

const achievementIdList = z.array(z.string()).catch([]);

function toView(row: KnowledgeDoc): KnowledgeDocView {
  const findings = docFindingsSchema.safeParse(row.findings);
  return { ...row, findings: findings.success ? findings.data : null, achievementIds: achievementIdList.parse(row.achievementIds) };
}

export async function createDoc(input: z.input<typeof docInputSchema>): Promise<KnowledgeDocView> {
  const data = docInputSchema.parse(input);
  // A new doc starts with no achievements made from it.
  const row = await prisma.knowledgeDoc.create({ data: { ...data, achievementIds: [] } });
  return toView(row);
}

export async function updateDoc(id: string, input: DocUpdate): Promise<KnowledgeDocView> {
  const row = await prisma.knowledgeDoc.update({ where: { id }, data: input });
  return toView(row);
}

export async function deleteDoc(id: string): Promise<void> {
  await prisma.knowledgeDoc.delete({ where: { id } });
}

export async function getDoc(id: string): Promise<KnowledgeDocView | null> {
  const row = await prisma.knowledgeDoc.findUnique({ where: { id } });
  return row ? toView(row) : null;
}

/** Newest first, optionally by status. */
export async function listDocs({ status }: { status?: KnowledgeDocStatus } = {}): Promise<KnowledgeDocView[]> {
  const rows = await prisma.knowledgeDoc.findMany({
    where: status ? { status } : {},
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  return rows.map(toView);
}

/**
 * Marks a doc reviewed: stores the findings and the prompt that wrote them,
 * and turns the drafted achievements into IMPORTED achievements traced back
 * to this doc (master.md §13).
 */
export async function markReviewed(id: string, findings: DocFindings, reviewedWith: string): Promise<void> {
  const reviewed = docFindingsSchema.parse(findings);
  const achievementIds = await Promise.all(
    reviewed.achievements.map(async (draft) => {
      const achievement = await createAchievement(
        { title: draft.title, description: draft.description, company: draft.company, technologies: draft.technologies, metrics: draft.metrics },
        { origin: `doc:${id}` },
      );
      return achievement.id;
    }),
  );
  await prisma.knowledgeDoc.update({
    where: { id },
    data: { status: KnowledgeDocStatus.REVIEWED, findings: reviewed, reviewedWith, achievementIds },
  });
}

/** The docs as one plain text for AI context, each framed by its name and kind. */
export function toKnowledgeText(docs: KnowledgeDocView[]): string {
  return docs.map((doc) => `--- ${doc.name} (${doc.kind.toLowerCase()}) ---\n${doc.content}`).join("\n\n");
}
