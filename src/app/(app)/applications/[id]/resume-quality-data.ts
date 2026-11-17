import "server-only";

import { resumeCritiqueSchema } from "@/lib/ai/task-contracts";
import { DocumentKind } from "@/generated/prisma/enums";
import { findUnfinishedJobs } from "@/lib/jobs/runner";
import { prisma } from "@/lib/prisma";
import { findingsByPriority } from "@/lib/resume-intel/critique";
import { evidenceForDocument } from "@/lib/resume-intel/evidence";

import type { ResumeQualityView } from "./resume-quality";
import { applyApplicationFindingsJobKey, critiqueApplicationResumeJobKey, tailoredResumeCritiqueName } from "./resume-quality-jobs";

/**
 * Everything the Resume quality tab shows (master.md §5), read in one go for
 * the page: the tailored document's id and prompt version, the achievements
 * backing it, and the newest critique of it, its findings already ranked.
 * The newest critique is the one saved under the application's company name;
 * failing that, the one a finished critique job last saved.
 */
export async function loadResumeQuality(applicationId: string, company: string): Promise<ResumeQualityView | null> {
  const document = await prisma.document.findUnique({
    where: { applicationId_kind: { applicationId, kind: DocumentKind.RESUME } },
    select: { id: true, writtenWith: true },
  });
  if (!document) return null;

  const [evidence, row, unfinishedCritique, unfinishedApply] = await Promise.all([
    evidenceForDocument(document.id),
    latestCritique(applicationId, company),
    findUnfinishedJobs(critiqueApplicationResumeJobKey(applicationId)),
    findUnfinishedJobs(applyApplicationFindingsJobKey(applicationId)),
  ]);
  // The stored findings, read back as the contract's list and ranked for the
  // improvements list (master.md §5.2). A row written by an older prompt that
  // no longer parses shows as no critique at all, never breaks the page.
  const parsed = row ? resumeCritiqueSchema.safeParse({ ...row, schema_version: "1.0", task: "resume_critique" }) : null;

  return {
    documentId: document.id,
    writtenWith: document.writtenWith,
    evidence,
    critique:
      parsed?.success
        ? { id: row!.id, appliedDocumentId: row!.appliedDocumentId, findings: findingsByPriority(parsed.data) }
        : null,
    unfinished: { critique: unfinishedCritique.at(-1)?.id ?? null, apply: unfinishedApply.at(-1)?.id ?? null },
  };
}

/** The newest critique of the tailored resume, or null when there isn't one. */
async function latestCritique(applicationId: string, company: string) {
  const byName = await prisma.resumeCritique.findFirst({
    where: { fileName: tailoredResumeCritiqueName(company) },
    orderBy: { createdAt: "desc" },
  });
  if (byName) return byName;
  // The critique saved by the application's last critique job, while its row
  // is still kept: a renamed company, say, would otherwise hide it.
  const job = await prisma.job.findFirst({
    where: { key: critiqueApplicationResumeJobKey(applicationId), status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { result: true },
  });
  const critiqueId = job?.result && typeof job.result === "object" && "critiqueId" in job.result ? job.result.critiqueId : null;
  return typeof critiqueId === "string" ? getCritiqueRow(critiqueId) : null;
}

async function getCritiqueRow(id: string) {
  return prisma.resumeCritique.findUnique({ where: { id } });
}
