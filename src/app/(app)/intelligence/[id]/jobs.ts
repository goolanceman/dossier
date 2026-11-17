import "server-only";

import { z } from "zod";

import { getProviderForTask } from "@/lib/ai/routing";
import { loadTaskOptions } from "@/lib/ai/task-options";
import {
  ASSESS_JOB_VERSION,
  COMPANY_RESEARCH_VERSION,
  GAP_QUESTIONS_VERSION,
  INTERVIEW_PREP_VERSION,
  LEARNING_PLAN_VERSION,
  SALARY_RESEARCH_VERSION,
  assessJob,
  companyResearch,
  gapQuestions,
  interviewPrep,
  learningPlan,
  salaryResearch,
} from "@/lib/ai/tasks";
import { dimensionScoresSchema, requirementMatchSchema, type JobAssessment, type SalaryResearch } from "@/lib/ai/task-contracts";
import { listAchievements } from "@/lib/career/achievements";
import { listTargets } from "@/lib/career/targets";
import { createGapQuestions } from "@/lib/gaps/lifecycle";
import { persistAssessment } from "@/lib/job-intel/assess";
import { saveCritique, type JobCritique } from "@/lib/job-intel/critique";
import { checkMandatoryRules, type MandatoryRule } from "@/lib/job-intel/mandatory";
import { createPlan as createInterviewPlan } from "@/lib/interview/plans";
import { createPlan as createLearningPlan } from "@/lib/learning/plan";
import { getEstimate, salaryFromPosting, saveResearched } from "@/lib/salary/estimate";
import { loadProfile } from "@/lib/profile-data";
import { prisma } from "@/lib/prisma";

import { defineJob } from "@/lib/jobs/runner";

// The Job Intelligence page's background work (master.md Phases 3–9): the
// deep assessment, salary, company and interview preparation, run as jobs so
// the screen follows their steps. Everything is kept through the existing
// services (job-intel, salary, gaps, interview, learning); the page only
// reads what they stored.

/** Every job on this page works on one posting. */
const postingIdSchema = z.object({ postingId: z.string().min(1).max(100) });

export const assessJobKey = (postingId: string) => `assess-posting:${postingId}`;
export const salaryJobKey = (postingId: string) => `posting-salary:${postingId}`;
export const critiqueJobKey = (postingId: string) => `posting-critique:${postingId}`;
export const gapQuestionsJobKey = (postingId: string) => `posting-gaps:${postingId}`;
export const interviewJobKey = (postingId: string) => `posting-interview:${postingId}`;
export const learningJobKey = (postingId: string) => `posting-learning:${postingId}`;
export const companyJobKey = (postingId: string) => `posting-company:${postingId}`;

/** The posting to work on, or a clear error in the job's log when it's gone. */
async function loadPosting(postingId: string) {
  const posting = await prisma.posting.findUnique({ where: { id: postingId } });
  if (!posting) throw new Error(`The posting ${postingId} no longer exists.`);
  return posting;
}

/** What the evidence prompts need from an achievement: its id, title and description. */
function forPrompts(achievements: Awaited<ReturnType<typeof listAchievements>>) {
  return achievements.map(({ id, title, description }) => ({ id, title, summary: description }));
}

/**
 * The mandatory rejection rules (master.md §3.2) for an assessment: the pay
 * floor, remote countries and other limits come from the primary career
 * target's preferences; a required technology the profile rules out counts
 * as genuinely missing.
 */
async function mandatoryRulesFor(posting: { remote: boolean | null; place: string; salary: string; title: string }, assessment: JobAssessment): Promise<MandatoryRule[]> {
  const [target] = await listTargets();
  const preferences = target?.preferences;
  const rule = checkMandatoryRules({
    profile: {
      salaryMin: preferences?.salaryMin ?? null,
      currency: preferences?.currency,
      remoteCountries: preferences?.remoteCountries,
    },
    posting: { remote: posting.remote, place: posting.place, salaryText: posting.salary, title: posting.title },
    assessment: { dimensions: assessment.dimensions },
    missingRequiredTech: assessment.requirements
      .filter((requirement) => requirement.importance === "REQUIRED" && requirement.status === "CONFIRMED_GAP")
      .map((requirement) => requirement.requirement),
  });
  return rule === null ? [] : [rule];
}

/** With no notes to read there is nothing to research from: the honest answer is Unavailable (master.md Phase 4). */
function withoutNotes(research: SalaryResearch, hadNotes: boolean): SalaryResearch {
  if (hadNotes) return research;
  return {
    ...research,
    status: "UNAVAILABLE",
    minimum: null,
    median: null,
    maximum: null,
    sources: [],
    methodology: "No salary sources were available to research from, so no figure is given.",
  };
}

/** The deep assessment (master.md §3.2–3.3): requirements with evidence, dimensions, decision. */
export const assessPostingJob = defineJob({
  type: "assess-posting",
  input: postingIdSchema,
  result: z.object({ assessmentId: z.string() }),
  async run({ postingId }, { step, signal }) {
    await step("Reading the posting");
    const posting = await loadPosting(postingId);
    const [profile, achievements] = await Promise.all([loadProfile(), listAchievements()]);

    await step("Assessing it against your profile");
    const [provider, options] = await Promise.all([getProviderForTask("assess-job"), loadTaskOptions()]);
    const { data, promptVersion } = await assessJob(
      provider,
      {
        posting: posting.description,
        title: posting.title,
        company: posting.company,
        location: posting.place,
        profile,
        achievements: forPrompts(achievements),
      },
      { ...options, signal },
    );

    await step("Applying the mandatory rejection rules");
    const row = await persistAssessment({ postingId, assessment: data, mandatoryRules: await mandatoryRulesFor(posting, data), promptVersion });

    // The pay the advert itself states is kept as a STATED estimate, so the
    // salary section always has the ad's own figure (master.md Phase 4).
    if (posting.salary.trim() !== "" && (await getEstimate(postingId)) === null) await salaryFromPosting(posting);
    return { assessmentId: row.id };
  },
});

/** Salary research (master.md Phase 4). No source fetcher is wired up yet, so the notes are empty and the honest result is Unavailable. */
export const researchSalaryJob = defineJob({
  type: "research-posting-salary",
  input: postingIdSchema,
  result: z.object({ status: z.string() }),
  async run({ postingId }, { step, signal }) {
    await step("Reading the posting");
    const posting = await loadPosting(postingId);

    await step("Researching the pay");
    // The notes the CALLER fetched would go here; without a configured
    // source there are none, and the task is told so honestly.
    const researchNotes = "";
    const allowedUrls: string[] = [];
    const [provider, options] = await Promise.all([getProviderForTask("salary-research"), loadTaskOptions()]);
    const { data, promptVersion } = await salaryResearch(
      provider,
      { title: posting.title, company: posting.company, location: posting.place, statedSalary: posting.salary, researchNotes, allowedUrls },
      { ...options, signal },
    );
    const research = withoutNotes(data, researchNotes.trim() !== "");
    await saveResearched({
      postingId,
      company: posting.company,
      title: posting.title,
      place: posting.place,
      country: "",
      research,
      researchedWith: promptVersion,
    });
    return { status: research.status };
  },
});

/**
 * The detailed critique (master.md §3.4), worked out from the stored
 * assessment: no separate AI task exists for it, so it maps the requirement
 * evidence onto the critique's fields and says so, rather than inventing
 * judgements no task made.
 */
export const critiquePostingJob = defineJob({
  type: "critique-posting",
  input: postingIdSchema,
  result: z.object({ recommendation: z.string() }),
  async run({ postingId }, { step }) {
    await step("Working from the assessment");
    const row = await prisma.jobAssessment.findUnique({ where: { postingId } });
    if (!row || row.score === null) throw new Error("The critique is worked out from the assessment; assess the posting first.");

    // The stored requirement mapping is what the assessment kept; the free-text
    // strengths and gaps lists are not persisted, so the critique maps from this.
    const requirements = z.array(requirementMatchSchema).catch([]).parse(row.requirements);
    const dimensions = dimensionScoresSchema.safeParse(row.dimensions);
    const suitable = requirements.filter((requirement) => requirement.status === "STRONG_EVIDENCE");
    const lacking = requirements.filter((requirement) => requirement.status === "CONFIRMED_GAP" || requirement.status === "MISSING_EVIDENCE");
    const transferable = requirements.filter((requirement) => requirement.status === "TRANSFERABLE");
    const RECOMMENDATION = {
      STRONG_MATCH: "APPLY",
      POTENTIAL_MATCH: "APPLY_AFTER_PREPARATION",
      WEAK_MATCH: "SAVE_FOR_LATER",
      REJECT: "REJECT",
      PENDING: "SAVE_FOR_LATER",
    } as const;
    const critique: JobCritique = {
      attractive: [],
      suitable: suitable.map((requirement) => `“${requirement.requirement}” — ${requirement.explanation}`.slice(0, 500)),
      lacking: lacking.map((requirement) => `“${requirement.requirement}” — ${requirement.explanation}`.slice(0, 500)),
      hiddenRequirements: transferable.map((requirement) => `Only adjacent experience backs “${requirement.requirement}”.`.slice(0, 500)),
      interviewDifficulty: "",
      seniorityMismatch:
        dimensions.success && dimensions.data.seniority < 50 ? `The role's seniority scores ${dimensions.data.seniority} of 100 against your profile.` : "",
      concerns: row.rejectedReason.trim() === "" ? [] : [row.rejectedReason.trim()],
      progression: "",
      salaryCompetitiveness: "",
      recommendation: RECOMMENDATION[row.decision],
      reasoning: `Worked out from the assessment (derived-from-assessment, ${row.assessedWith || "no prompt version recorded"}): ${suitable.length} requirement${suitable.length === 1 ? "" : "s"} with strong evidence, ${lacking.length} lacking or unproven, ${transferable.length} transferable.`,
    };
    await saveCritique(postingId, critique);
    return { recommendation: critique.recommendation };
  },
});

/** Gap questions (master.md Phase 6): what only the candidate knows, kept through the lifecycle. */
export const generateGapQuestionsJob = defineJob({
  type: "generate-posting-gap-questions",
  input: postingIdSchema,
  result: z.object({ count: z.number().int().min(0) }),
  async run({ postingId }, { step, signal }) {
    await step("Reading the posting");
    const posting = await loadPosting(postingId);
    const profile = await loadProfile();

    await step("Finding what only you can answer");
    const [provider, options] = await Promise.all([getProviderForTask("gap-questions"), loadTaskOptions()]);
    const { data, promptVersion } = await gapQuestions(
      provider,
      { posting: posting.description, title: posting.title, company: posting.company, profile },
      { ...options, signal },
    );
    const ids = await createGapQuestions({ postingId, generated: data, generatedWith: promptVersion });
    return { count: ids.length };
  },
});

/** Interview preparation (master.md Phase 7), across the five default rounds (§7.2). */
const INTERVIEW_ROUNDS = [
  { name: "Recruiter", focus: "Screening and motivation" },
  { name: "Technical", focus: "Core engineering skills" },
  { name: "System design", focus: "Architecture and trade-offs" },
  { name: "Hiring manager", focus: "Fit, collaboration and delivery" },
  { name: "Culture and leadership", focus: "Values and growth" },
];

export const prepareInterviewJob = defineJob({
  type: "prepare-posting-interview",
  input: postingIdSchema,
  result: z.object({ planId: z.string() }),
  async run({ postingId }, { step, signal }) {
    await step("Reading the posting");
    const posting = await loadPosting(postingId);
    const [profile, achievements] = await Promise.all([loadProfile(), listAchievements()]);

    await step("Preparing interview questions");
    const [provider, options] = await Promise.all([getProviderForTask("interview-prep"), loadTaskOptions()]);
    const { data, promptVersion } = await interviewPrep(
      provider,
      { title: posting.title, company: posting.company, posting: posting.description, profile, achievements: forPrompts(achievements), stage: "" },
      { ...options, signal },
    );
    const { planId } = await createInterviewPlan({
      postingId,
      role: [posting.title, posting.company].filter(Boolean).join(" at "),
      rounds: INTERVIEW_ROUNDS,
      generated: data,
      preparedWith: promptVersion,
    });
    return { planId };
  },
});

/**
 * A learning plan (master.md Phase 8) from the gaps the assessment stored:
 * the requirements its evidence cannot back.
 */
export const createLearningPlanJob = defineJob({
  type: "create-posting-learning-plan",
  input: postingIdSchema,
  result: z.object({ planId: z.string() }),
  async run({ postingId }, { step, signal }) {
    await step("Reading the posting and the assessment");
    const posting = await loadPosting(postingId);
    const [row, profile] = await Promise.all([prisma.jobAssessment.findUnique({ where: { postingId } }), loadProfile()]);
    const gaps = z
      .array(requirementMatchSchema)
      .catch([])
      .parse(row?.requirements)
      .filter((requirement) => requirement.status === "CONFIRMED_GAP" || requirement.status === "MISSING_EVIDENCE" || requirement.status === "TRANSFERABLE")
      .map((requirement) => requirement.requirement);
    const goal = `Be ready for ${posting.title || "this role"} at ${posting.company || "this company"}`.concat(
      gaps.length > 0 ? `: close the gaps in ${gaps.join(", ")}` : "",
      ".",
    ).slice(0, 1_000);

    await step("Planning what to learn");
    const [provider, options] = await Promise.all([getProviderForTask("learning-plan"), loadTaskOptions()]);
    const { data, promptVersion } = await learningPlan(provider, { goal, known: profile.skills.map((skill) => skill.name), weeklyHours: 0 }, { ...options, signal });
    const planId = await createLearningPlan({ postingId, goal, generated: data, plannedWith: promptVersion });
    return { planId };
  },
});

/**
 * Company research (master.md Phase 9). No source fetcher is wired up yet:
 * the notes are empty, so every fact comes out as INTERPRETATION and the
 * screen says exactly that.
 */
export const researchCompanyJob = defineJob({
  type: "research-posting-company",
  input: postingIdSchema,
  result: z.object({ company: z.string() }),
  async run({ postingId }, { step, signal }) {
    await step("Reading the posting");
    const posting = await loadPosting(postingId);
    if (posting.company.trim() === "") throw new Error("The posting doesn't name a company to research.");

    await step("Researching the company");
    // The notes the CALLER fetched would go here; without a configured
    // source there are none, and no CONFIRMED fact is possible.
    const researchNotes = "";
    const allowedUrls: string[] = [];
    const [provider, options] = await Promise.all([getProviderForTask("company-research"), loadTaskOptions()]);
    const { data, promptVersion } = await companyResearch(provider, { company: posting.company, title: posting.title, researchNotes, allowedUrls }, { ...options, signal });
    const row = {
      research: data,
      sources: [] as { url: string; label: string; retrievedAt: string }[],
      researchedWith: promptVersion,
    };
    await prisma.companyResearch.upsert({ where: { company: posting.company }, create: { company: posting.company, ...row }, update: { ...row } });
    return { company: posting.company };
  },
});

// The prompt versions, for tests and for anything that wants to name them.
export const PROMPT_VERSIONS = {
  assess: ASSESS_JOB_VERSION,
  salary: SALARY_RESEARCH_VERSION,
  gaps: GAP_QUESTIONS_VERSION,
  interview: INTERVIEW_PREP_VERSION,
  learning: LEARNING_PLAN_VERSION,
  company: COMPANY_RESEARCH_VERSION,
} as const;
