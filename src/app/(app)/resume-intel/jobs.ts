import "server-only";

import { z } from "zod";

import { resumeCritiqueSchema, type ResumeCritique } from "@/lib/ai/task-contracts";
import { factSources, guardSources, guardUnits } from "@/lib/ai/fact-guard";
import { getProviderForTask } from "@/lib/ai/routing";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { applyFindings, careerPlan, resumeCritique } from "@/lib/ai/tasks";
import { unitsSchema, type Unit } from "@/lib/application-data";
import { listAchievements } from "@/lib/career/achievements";
import { createCareerPlan } from "@/lib/career/plan";
import { getTarget, listTargets } from "@/lib/career/targets";
import { defineJob } from "@/lib/jobs/runner";
import { loadProfile } from "@/lib/profile-data";
import { MAX_RESUME_CHARACTERS } from "@/lib/resume-text";
import { profileResumeText } from "@/lib/resume-intel/base-resume-text";
import { getCritique, saveCritique } from "@/lib/resume-intel/critique";
import { mapDocumentEvidence } from "@/lib/resume-intel/evidence";
import {
  getMasterDocument,
  masterUnitsFromProfile,
  saveMasterDocument,
  validateAppliedUnits,
} from "@/lib/resume-intel/master";
import { prisma } from "@/lib/prisma";

import { APPLY_STEPS, CRITIQUE_STEPS, PLAN_STEPS } from "./view";

/**
 * Critiques a resume (master.md §5.1): the text comes from the upload route,
 * from the paste box, or, in BASE mode, is built from the profile here, and
 * the critique task judges it the way an ATS, a writer and a recruiter
 * would, then the answer is stored verbatim so every recommendation stays
 * checkable against the resume text beside it.
 */
export const critiqueResumeJob = defineJob({
  type: "critique-resume",
  // The mode picks the resume (master.md §5.1): BASE builds the text from the
  // profile in the job itself, so no resume text travels in the input; FILE
  // carries the uploaded or pasted text.
  input: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("BASE"), targetId: z.string().max(50).default("") }),
    z.object({
      mode: z.literal("FILE"),
      content: z.string().min(1).max(MAX_RESUME_CHARACTERS),
      fileName: z.string().max(200).default(""),
      targetId: z.string().max(50).default(""),
    }),
  ]),
  result: z.object({ critiqueId: z.string() }),
  async run(input, { step, signal }) {
    await step(CRITIQUE_STEPS[0]);
    const [provider, options, profile] = await Promise.all([getProviderForTask("resume-critique"), loadTaskOptions(), loadProfile()]);
    // A target deleted in the meantime falls back to a general critique, so a retry still works.
    const target = input.targetId ? await getTarget(input.targetId) : null;

    await step(CRITIQUE_STEPS[1]);
    const content = input.mode === "BASE" ? profileResumeText(profile) : input.content;
    // The target's summary stands in for a posting: it says what the resume
    // is judged against, without implying any employer's text.
    const { data, promptVersion } = await resumeCritique(
      provider,
      {
        resume: content,
        title: target?.title ?? profile.basics.headline,
        company: "",
        posting: target?.summary ?? "",
        profile,
      },
      { ...options, signal },
    );

    await step(CRITIQUE_STEPS[2]);
    const critiqueId = await saveCritique({
      fileName: input.mode === "BASE" ? "" : input.fileName,
      content,
      critique: data,
      critiquedWith: promptVersion,
      targetId: target?.id,
    });
    return { critiqueId };
  },
});

/** The stored critique's JSON columns, read back as the contract's data; nothing is re-scored. */
function storedCritique(row: NonNullable<Awaited<ReturnType<typeof getCritique>>>): ResumeCritique {
  return resumeCritiqueSchema.parse({
    overall: row.overall,
    findings: row.findings,
    keywordCoverage: row.keywordCoverage,
    formattingIssues: row.formattingIssues,
    strengths: [],
    schema_version: "1.0",
    task: "resume_critique",
  });
}

/**
 * The evidence for the master document: what it already had, plus the
 * achievements this critique's findings added to the library
 * (addFindingEvidence), mapped to the units their changes went into.
 * mapDocumentEvidence replaces the whole set, so the earlier mappings ride along.
 */
async function evidenceMappings(
  documentId: string,
  critiqueId: string,
  changes: { findingId: string; unitId: string }[],
): Promise<{ achievementId: string; unitId: string }[]> {
  const existing = await prisma.documentEvidence.findMany({ where: { documentId }, select: { achievementId: true, unitId: true } });
  const unitOfFinding = new Map(changes.map(({ findingId, unitId }) => [findingId, unitId]));
  const created = await prisma.careerAchievement.findMany({
    where: { origin: { startsWith: `resume-critique:${critiqueId}:` } },
    select: { id: true, origin: true },
  });
  const added = created.flatMap(({ id, origin }) => {
    const unitId = unitOfFinding.get(origin.slice(`resume-critique:${critiqueId}:`.length));
    return unitId ? [{ achievementId: id, unitId }] : [];
  });
  return [...existing, ...added];
}

/**
 * Applies critique findings to the master resume (master.md §5.2): the task
 * rewrites the master's units, the fact guard reverts any unit that added a
 * number the input didn't have (never invent, §13), and the result is saved
 * as the master document with a version and the critique marked applied.
 */
export const applyFindingsJob = defineJob({
  type: "apply-findings",
  // Empty findingIds means every finding; the screen sends the checkboxes' selection.
  input: z.object({ critiqueId: z.string().min(1), findingIds: z.array(z.string().max(60)).max(40).default([]) }),
  result: z.object({ documentId: z.string(), applied: z.number(), unapplied: z.number() }),
  async run({ critiqueId, findingIds }, { step, signal }) {
    await step(APPLY_STEPS[0]);
    const [row, profile, master] = await Promise.all([getCritique(critiqueId), loadProfile(), getMasterDocument()]);
    if (!row) throw new Error("That critique isn't there any more. It may have been deleted.");
    const critique = storedCritique(row);
    const chosen = findingIds.length > 0 ? critique.findings.filter((finding) => findingIds.includes(finding.id)) : critique.findings;
    if (chosen.length === 0) throw new Error("Nothing is left of this critique's findings to apply.");
    // The master resume's units, or the profile's when none is saved yet (master.md §5.5).
    const parsed = master ? unitsSchema.safeParse(master.units) : null;
    const units: Unit[] = parsed?.success ? parsed.data : masterUnitsFromProfile(profile);

    await step(APPLY_STEPS[1]);
    const [provider, options] = await Promise.all([getProviderForTask("apply-findings"), loadTaskOptions()]);
    const { data } = await applyFindings(
      provider,
      {
        units,
        findings: chosen,
        // The critiqued resume's own text is the context the findings refer to.
        resume: row.content,
        profile,
        strict: options.strict,
      },
      { ...options, signal },
    );

    await step(APPLY_STEPS[2]);
    // Fact guard (master.md §13): a unit the guard flags that ADDS a number
    // the input didn't have goes back to its input text. Flagged units that
    // added none stay: wording alone isn't an invented fact.
    const flagged = new Set(validateAppliedUnits(data.units, profile).map(({ unitId }) => unitId));
    const finalUnits = guardUnits(
      data.units.map((unit) => {
        const before = units.find((existing) => existing.id === unit.id);
        if (!before || !flagged.has(unit.id)) return unit;
        const beforeNumbers = factSources([before.text]).numbers;
        const addedNumbers = [...factSources([unit.text]).numbers].some((number) => !beforeNumbers.has(number));
        return addedNumbers ? { id: before.id, label: before.label, text: before.text } : unit;
      }),
      // What the guard still can't back is stored on the unit, as on every tailored document (E8-3).
      guardSources(profile, null, ""),
    );

    const document = await saveMasterDocument(finalUnits, { critiqueId });
    await mapDocumentEvidence(document.id, await evidenceMappings(document.id, critiqueId, data.changes));

    const unapplied = new Set(data.unapplied.map(({ findingId }) => findingId));
    const applied = chosen.filter(({ id }) => !unapplied.has(id)).length;
    // saveMasterDocument writes the version row (REGENERATED) and marks the critique applied itself.
    return { documentId: document.id, applied, unapplied: data.unapplied.length };
  },
});

/**
 * Plans career goals from the resume (master.md Phase 5): the plan task
 * reads the resume with the profile, the targets and the evidence library,
 * and the plan is stored for the Career page's plan section.
 */
export const careerPlanJob = defineJob({
  type: "career-plan",
  // A critique's id when the plan builds on one; the base resume alone otherwise.
  input: z.object({ critiqueId: z.string().max(50).default("") }),
  result: z.object({ planId: z.string() }),
  async run({ critiqueId }, { step, signal }) {
    await step(PLAN_STEPS[0]);
    const [profile, targets, achievements, row] = await Promise.all([
      loadProfile(),
      listTargets(),
      listAchievements(),
      critiqueId ? getCritique(critiqueId) : null,
    ]);
    // The critiqued resume's own text when the plan builds on a critique; the base resume's otherwise.
    const resume = row?.content || profileResumeText(profile);

    await step(PLAN_STEPS[1]);
    const [provider, options] = await Promise.all([getProviderForTask("career-plan"), loadTaskOptions()]);
    const { data, promptVersion } = await careerPlan(
      provider,
      {
        resume,
        profile,
        targets: targets.map(({ id, title, summary }) => ({ id, title, summary })),
        // No assessment behind a resume-based plan, so no gaps to close in it.
        gaps: [],
        achievements: achievements.map(({ id, title }) => ({ id, title })),
      },
      { ...options, signal },
    );

    await step(PLAN_STEPS[2]);
    const plan = await createCareerPlan({
      basedOn: "RESUME",
      headline: data.headline,
      summary: data.summary,
      goals: data.goals,
      risks: data.risks,
      planWith: promptVersion,
      ...(row ? { critiqueId: row.id } : {}),
    });
    return { planId: plan.id };
  },
});

export type CritiqueResumeResult = z.infer<typeof critiqueResumeJob.result>;
export type ApplyFindingsResult = z.infer<typeof applyFindingsJob.result>;
export type CareerPlanResult = z.infer<typeof careerPlanJob.result>;
