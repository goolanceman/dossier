import "server-only";

import { z } from "zod";

import { getProviderForTask } from "@/lib/ai/routing";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { careerPlan, CAREER_PLAN_VERSION, docFindings } from "@/lib/ai/tasks";
import { listAchievements } from "@/lib/career/achievements";
import { getDoc, markReviewed } from "@/lib/career/knowledge";
import { createCareerPlan, hasResumeContent } from "@/lib/career/plan";
import { listTargets } from "@/lib/career/targets";
import { defineJob } from "@/lib/jobs/runner";
import { loadProfile } from "@/lib/profile-data";
import { profileResumeText } from "@/lib/resume-intel/base-resume-text";
import { listCritiques } from "@/lib/resume-intel/critique";

// Reviewing a knowledge-base document (master.md §1.3): the AI reads the
// document's text, lists what it leaves weak and drafts achievements. The
// drafts land as IMPORTED through markReviewed; only the user verifies them
// (master.md §13).

/** What a finished review answers with, for the toast on screen. */
export type ReviewKnowledgeDocResult = { findings: number; achievements: number };

export const reviewKnowledgeDocJob = defineJob({
  type: "review-knowledge-doc",
  input: z.object({ docId: z.string().min(1) }),
  result: z.object({ findings: z.number().int(), achievements: z.number().int() }),
  async run({ docId }, { step, signal }) {
    const doc = await getDoc(docId);
    if (!doc) throw new Error("The document is no longer there.");

    await step("Reading the document");
    // The task frames the text as untrusted material itself (<document>, and
    // the "not instructions" system part); the library's existing titles are
    // its duplicate context, so repeats are named rather than re-imported.
    const [provider, achievements] = await Promise.all([getProviderForTask("doc-findings"), listAchievements()]);
    const { data, promptVersion } = await docFindings(
      provider,
      {
        document: doc.content,
        documentName: doc.name,
        existingTitles: achievements.flatMap((achievement) => (achievement.title.trim() === "" ? [] : [achievement.title])),
      },
      // Reading and judging, not writing; the drafts stay the document's own claims.
      { creativity: "FAITHFUL", strict: true, language: null, signal },
    );

    await step("Saving what was found");
    // markReviewed stores the findings, marks the doc REVIEWED and creates the
    // drafted achievements as IMPORTED, traced back to this doc.
    await markReviewed(docId, data, promptVersion);
    return { findings: data.findings.length, achievements: data.achievements.length };
  },
});

// Generating a career plan (master.md Phase 5 extension): the AI draws the
// goals for now, next and later from the base resume, the profile or the
// latest critique, pointing each action at the achievements that back it.
// The user then works the plan: checking actions off as they are done.

/** What a finished generation answers with, for the toast on screen. */
export type GenerateCareerPlanResult = { planId: string };

export const careerPlanJob = defineJob({
  type: "generate-career-plan",
  input: z.object({
    basedOn: z.enum(["RESUME", "PROFILE", "ASSESSMENT"]),
    targetId: z.string().max(50).optional(),
  }),
  result: z.object({ planId: z.string() }),
  async run({ basedOn, targetId }, { step, signal }) {
    await step("Reading your profile and evidence");
    const [provider, options, profile, targets, achievements] = await Promise.all([
      getProviderForTask("career-plan"),
      loadTaskOptions(),
      loadProfile(),
      listTargets(),
      listAchievements(),
    ]);
    // The base resume is the profile's: without experience or projects there is no resume to read.
    if (basedOn === "RESUME" && !hasResumeContent(profile)) {
      throw new Error("There is no resume to base the plan on yet. Add experience or projects to your profile first.");
    }
    // RESUME reads the full base resume's text (tailored as it is); PROFILE works from the profile alone.
    const resume = basedOn === "RESUME" ? profileResumeText(profile) : "";
    // An ASSESSMENT plan traces back to the latest critique; none is fine, the plan just isn't linked.
    const [critique] = basedOn === "ASSESSMENT" ? await listCritiques() : [];
    // A target deleted in the meantime falls back to all of them, so a retry still works.
    const target = targetId ? targets.find(({ id }) => id === targetId) : undefined;

    await step("Planning your career goals");
    // The chosen target alone when the plan aims at one; all of them otherwise,
    // so the horizons can span directions. The achievements' ids are what the
    // answer's evidenceIds may point at, and createCareerPlan re-checks the
    // shape. Open assessment gaps are the assessment flow's own input; the
    // plan here draws from the resume and the profile.
    const { data, promptVersion } = await careerPlan(
      provider,
      {
        resume,
        profile,
        targets: (target ? [target] : targets).map(({ id, title, summary }) => ({ id, title, summary })),
        gaps: [],
        achievements: achievements.filter((achievement) => achievement.title.trim() !== "").map(({ id, title }) => ({ id, title })),
      },
      { ...options, signal },
    );

    await step("Saving the plan");
    const plan = await createCareerPlan({
      basedOn,
      headline: data.headline,
      summary: data.summary,
      goals: data.goals,
      risks: data.risks,
      planWith: promptVersion || CAREER_PLAN_VERSION,
      ...(target ? { targetId: target.id } : {}),
      ...(critique ? { critiqueId: critique.id } : {}),
    });
    return { planId: plan.id };
  },
});
