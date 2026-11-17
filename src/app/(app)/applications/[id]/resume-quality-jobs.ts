import "server-only";

import { z } from "zod";

import { DocumentKind, VersionCause } from "@/generated/prisma/enums";
import { applyFindings, resumeCritique } from "@/lib/ai/tasks";
import { resumeCritiqueSchema, type ApplyFindings } from "@/lib/ai/task-contracts";
import { getProviderForTask } from "@/lib/ai/routing";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { AiError } from "@/lib/ai/errors";
import { unitsSchema, type Unit } from "@/lib/application-data";
import { profileOfApplication } from "@/lib/frozen-copy";
import { updateDocuments } from "@/lib/document-units";
import { defineJob } from "@/lib/jobs/runner";
import { prisma } from "@/lib/prisma";
import { profileResumeText } from "@/lib/resume-intel/base-resume-text";
import { getCritique, saveCritique } from "@/lib/resume-intel/critique";
import { mapDocumentEvidence, validateTailoredUnits } from "@/lib/resume-intel/evidence";

// The application page's resume quality loop (master.md §5): critique the
// tailored resume the way an ATS, a writer and a recruiter would, then apply
// the findings that can be applied without inventing facts (§5.3, §13).

/** The key of critiquing an application's tailored resume, to find it again after a reload. */
export const critiqueApplicationResumeJobKey = (applicationId: string) => `critique-application-resume:${applicationId}`;

/** The key of applying findings to an application's tailored resume. */
export const applyApplicationFindingsJobKey = (applicationId: string) => `apply-application-findings:${applicationId}`;

/** The critique row's name for an application's tailored resume, which finds it again after a reload. */
export const tailoredResumeCritiqueName = (company: string) => `${company.trim()} tailored resume`.trim();

/**
 * "Critique this resume" (master.md §5.1–5.2): the tailored resume as flat
 * text, judged by the resume_critique task, stored verbatim through the same
 * saveCritique the Resume intelligence screen uses, so both lists agree.
 */
export const critiqueApplicationResumeJob = defineJob({
  type: "critique-application-resume",
  input: z.object({ applicationId: z.string().min(1) }),
  result: z.object({ critiqueId: z.string() }),
  async run({ applicationId }, { step, signal }) {
    await step("Reading the tailored resume");
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { documents: { where: { kind: DocumentKind.RESUME }, select: { units: true } } },
    });
    const units = unitsSchema.safeParse(application.documents[0]?.units);
    // Said as it is, like an AI provider that isn't set up.
    if (!units.success) throw AiError.config("This application has no tailored resume to critique. Write it first.");

    const [provider, options, profile] = await Promise.all([getProviderForTask("resume-critique"), loadTaskOptions(), profileOfApplication(application.frozen)]);
    const text = profileResumeText(profile, { units: units.data });

    await step("Critiquing the resume");
    const { data, promptVersion } = await resumeCritique(
      provider,
      {
        resume: text,
        title: application.role || application.title,
        company: application.company,
        posting: application.postingText,
        profile,
      },
      { ...options, signal },
    );

    await step("Saving the critique");
    const critiqueId = await saveCritique({
      fileName: tailoredResumeCritiqueName(application.company),
      content: text,
      critique: data,
      critiquedWith: promptVersion,
    });
    return { critiqueId };
  },
});

/**
 * "Apply N findings" (master.md §5.2–5.3): the checked findings go to the
 * apply_findings task, whose full unit list replaces the document's, after
 * every changed unit passes the numbers check: a unit that states numbers
 * no achievement backs reverts to its input text. Writes the document the
 * same way the refine flow does, so the earlier state is in its history.
 */
export const applyApplicationFindingsJob = defineJob({
  type: "apply-application-findings",
  input: z.object({
    applicationId: z.string().min(1),
    critiqueId: z.string().min(1),
    /** The checked findings to apply; everything when left out. */
    findingIds: z.array(z.string().min(1)).optional(),
  }),
  result: z.object({
    /** What was applied, one entry per change. */
    applied: z.array(z.object({ findingId: z.string(), unitId: z.string(), summary: z.string() })),
    /** Findings that could not be applied, with why (master.md §13). */
    unapplied: z.array(z.object({ findingId: z.string(), reason: z.string() })),
  }),
  async run({ applicationId, critiqueId, findingIds }, { step, signal }) {
    await step("Reading the resume and the critique");
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { documents: { where: { kind: DocumentKind.RESUME } } },
    });
    const document = application.documents[0];
    const units = unitsSchema.safeParse(document?.units);
    if (!units.success) throw AiError.config("This application has no tailored resume to apply findings to. Write it first.");
    const critique = await getCritique(critiqueId);
    if (!critique) throw AiError.config("That critique isn't there any more. Run a new one from the Resume quality tab.");
    // The stored findings JSON, read back as the contract's list.
    const stored = resumeCritiqueSchema.shape.findings.safeParse(critique.findings);
    if (!stored.success || stored.data.length === 0) throw AiError.config("That critique has no findings to apply. Run a new one from the Resume quality tab.");
    const wanted = findingIds === undefined ? new Set(stored.data.map((finding) => finding.id)) : new Set(findingIds);
    const findings = stored.data.filter((finding) => wanted.has(finding.id));
    if (findings.length === 0) throw AiError.config("Tick at least one finding to apply.");

    const [provider, options, profile] = await Promise.all([getProviderForTask("apply-findings"), loadTaskOptions(), profileOfApplication(application.frozen)]);
    // The same flat text the critique was saved with, for the context the findings refer to.
    const text = profileResumeText(profile, { units: units.data });

    await step("Applying the findings");
    const { data } = await applyFindings(
      provider,
      { units: units.data, findings, resume: text, profile, strict: options.strict },
      { ...options, signal },
    );

    await step("Checking the numbers against your evidence");
    const applied = applyFindingsToUnits(units.data, data, await evidenceOf(document.id));

    await step("Saving the resume");
    const { detail, changes } = applied;
    const result = await updateDocuments(applicationId, async (documents) => {
      const current = documents[DocumentKind.RESUME];
      if (!current) throw AiError.config("This application has no tailored resume to apply findings to. Write it first.");
      documents[DocumentKind.RESUME] = applied.units;
      return { applied: changes, unapplied: applied.unapplied };
    }, { version: changes.length > 0 ? { cause: VersionCause.REGENERATED, detail } : undefined });
    // Written after the document itself: updateDocuments checks it wasn't changed meanwhile.
    if (changes.length > 0) {
      await mapDocumentEvidence(document.id, applied.evidence);
      await prisma.resumeCritique.update({ where: { id: critiqueId }, data: { appliedDocumentId: document.id } });
    }
    return result;
  },
});

/** The document's evidence as the plain mappings the checks and the re-map need. */
async function evidenceOf(documentId: string): Promise<{ achievementId: string; unitId: string }[]> {
  return prisma.documentEvidence.findMany({ where: { documentId }, select: { achievementId: true, unitId: true } });
}

/** Applies the task's answer to the input units (master.md §5.3, §13): changed units that state numbers no achievement backs revert. */
function applyFindingsToUnits(
  input: Unit[],
  answer: ApplyFindings,
  evidence: { achievementId: string; unitId: string }[],
): { units: Unit[]; changes: ApplyFindings["changes"]; unapplied: { findingId: string; reason: string }[]; evidence: { achievementId: string; unitId: string }[]; detail: string } {
  const byId = new Map(input.map((unit) => [unit.id, unit]));
  // Only a unit the task changed can state a number the profile doesn't back.
  const changed = answer.units.filter((unit) => byId.get(unit.id)?.text !== unit.text);
  const { violations } = validateTailoredUnits(changed, evidence, true);
  const reverted = new Set(violations.map(({ unitId }) => unitId));

  const units = answer.units.map<Unit>((unit) => {
    const before = byId.get(unit.id);
    // Unchanged and reverted units keep their input text, label and fact-guard flags.
    if (!before || before.text === unit.text || reverted.has(unit.id)) return before ?? { id: unit.id, label: unit.label, text: unit.text };
    // The task may not rename parts or drop the fact guard's flags silently.
    return { id: before.id, label: before.label, text: unit.text };
  });
  // Nothing important is removed to fit a finding (master.md §5.4).
  const kept = new Set(units.map((unit) => unit.id));
  for (const unit of input) if (!kept.has(unit.id)) units.push(unit);

  const changes = answer.changes.filter((change) => !reverted.has(change.unitId));
  const unapplied = [...answer.unapplied];
  for (const change of answer.changes) {
    if (reverted.has(change.unitId) && !unapplied.some((entry) => entry.findingId === change.findingId)) {
      unapplied.push({
        findingId: change.findingId,
        reason: "Applying it would have stated numbers your achievements don't back, so the part was left as it was.",
      });
    }
  }

  const count = changes.length;
  return {
    units,
    changes,
    unapplied,
    // The apply rewrites wording, not which achievements back which part (§5.3).
    evidence,
    detail: `Applied ${count} ${count === 1 ? "finding" : "findings"} from the critique`,
  };
}

export type CritiqueApplicationResumeResult = z.infer<typeof critiqueApplicationResumeJob.result>;
export type ApplyApplicationFindingsResult = z.infer<typeof applyApplicationFindingsJob.result>;
