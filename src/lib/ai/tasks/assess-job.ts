import type { ProfileData } from "@/lib/profile";

import { jobAssessmentSchema, type JobAssessment } from "../task-contracts";

import { NO_EM_DASHES, postingForPrompt, profileForPrompt, system, truthfulness, UNTRUSTED_POSTING, type Task } from "./prompt-parts";

export const ASSESS_JOB_VERSION = "assess-job@1";

// The pipeline's deep look (master.md §3.2–3.3): requirement by requirement,
// with evidence from the library, a score per dimension and a recommendation.

const answerSchema = jobAssessmentSchema;

/** What the model answers; code checks the evidence ids (assessmentFrom). */
export type JobAssessmentAnswer = typeof answerSchema._output;

const INSTRUCTIONS = `You assess how well a job fits a candidate, requirement by requirement, as JSON. Start with "schema_version": "1.0" and "task": "job_assessment".

Judge only what the posting and the candidate's profile and achievements show:
- requirements: one entry per requirement of the posting, in its order. importance is REQUIRED or PREFERRED as the posting states it. status: STRONG_EVIDENCE when the profile shows it clearly, PARTIAL_EVIDENCE when partly, TRANSFERABLE when close experience could stand in, MISSING_EVIDENCE when the profile has nothing on it, CONFIRMED_GAP when the profile rules it out, NOT_APPLICABLE when the posting doesn't really require it. evidenceIds lists the achievements that back the requirement, by their ids, and only those. jdQuotes quotes the posting's own words for the requirement, kept exactly.
- dimensions: 0 to 100 for each, judging only what the profile shows; 0 when there is nothing to judge it on.
- decision: recommendation APPLY, APPLY_AFTER_PREPARATION, SAVE_FOR_LATER or REJECT, with a compatibility score from 0 to 100. mandatoryRejection is true only when a hard requirement the profile can't meet, such as a work permit or an essential degree, rules the job out.
- strengths, gaps, transferableSkills, risks, nextActions: short, specific entries, each pointing at something in the posting, the profile or the achievements.

Never use age, gender, nationality, ethnicity, religion, disability, family status or any other protected characteristic.`;

export type AssessJobInput = {
  posting: string;
  title: string;
  company: string;
  location: string;
  profile: ProfileData;
  /**
   * The evidence library the answer may point at, by id (master.md §12.5:
   * never invent evidence IDs). Anything else is dropped before saving.
   */
  achievements: { id: string; title: string; summary: string }[];
};

const MAX_QUOTES = 5;
const MAX_QUOTE_LENGTH = 300;

/** The answer, trusting nothing: evidence ids only from the library, quotes kept, empty requirements out. */
export function assessmentFrom(answer: JobAssessmentAnswer, achievementIds: string[]): JobAssessment {
  const allowed = new Set(achievementIds);
  return {
    ...answer,
    requirements: answer.requirements
      .filter((requirement) => requirement.requirement.trim() !== "")
      .map((requirement) => ({
        ...requirement,
        requirement: requirement.requirement.trim().slice(0, MAX_QUOTE_LENGTH),
        jdQuotes: requirement.jdQuotes.map((quote) => quote.trim().slice(0, MAX_QUOTE_LENGTH)).filter(Boolean).slice(0, MAX_QUOTES),
        evidenceIds: requirement.evidenceIds.filter((id) => allowed.has(id)),
      })),
  };
}

/** The full assessment: requirements with evidence, dimensions, decision. Contact details are never sent. */
export const assessJob: Task<AssessJobInput, JobAssessment> = async (provider, input, { signal }) => {
  const { posting, title, company, location, profile, achievements } = input;
  const answer = await provider.complete({
    task: "assess-job",
    system: system(
      INSTRUCTIONS,
      truthfulness(true),
      UNTRUSTED_POSTING,
      NO_EM_DASHES,
    ),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile:\n${profileForPrompt(profile)}`,
          achievements.length > 0
            ? `The candidate's achievements, by id, that answers may point at as evidence:\n${JSON.stringify(achievements, null, 2)}`
            : "The candidate has no verified achievements to point at yet: evidenceIds stays empty.",
          `The job's facts:\n${JSON.stringify({ title, company, location }, null, 2)}`,
          `The posting:\n${postingForPrompt(posting)}`,
        ].join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "job_assessment",
    // Deep judging: faithful wording, with room to think it through.
    creativity: "FAITHFUL",
    signal,
  });
  return { data: assessmentFrom(answer, achievements.map((achievement) => achievement.id)), promptVersion: ASSESS_JOB_VERSION };
};
