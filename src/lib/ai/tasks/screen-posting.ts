import { z } from "zod";

import type { ProfileData } from "@/lib/profile";

import { screenPostingSchema, type ScreenPosting } from "../task-contracts";

export type { ScreenPosting };

import { NO_EM_DASHES, postingForPrompt, profileForPrompt, system, truthfulness, UNTRUSTED_POSTING, type Task } from "./prompt-parts";

export const SCREEN_POSTING_VERSION = "screen-posting@1";

// The pipeline's cheap first look (master.md §2.4 stage 3): a shortlist or a
// skip, before anything is spent on a full assessment.

const answerSchema = screenPostingSchema;

/** What the model answers; code trims it (screenPostingFrom). */
export type ScreenAnswer = z.infer<typeof answerSchema>;

const INSTRUCTIONS = `You screen a job posting against what the candidate is looking for and what they have, before anyone assesses it in full. Answer as JSON, starting with "schema_version": "1.0" and "task": "screen_posting".

Answer "SHORTLIST" when the posting is worth a full assessment, "SKIP" when it isn't. Judge only what the posting, the criteria and the profile show:
- the requirements that matter most against the profile's skills and experience;
- seniority and scope, in both directions: a role far above the candidate's level is as much a mismatch as one well below it;
- location, remote work, work permit and language, when the posting states them.

- reasons: one to three short sentences, each pointing at a specific requirement of the posting and what the profile or the criteria say about it.
- confidence: HIGH when the posting clearly matches or clearly doesn't, MEDIUM when it's close or the posting is too thin to judge.

A posting too thin to judge is shortlisted anyway, with MEDIUM confidence and a reason that says so: the full assessment sees more. Never use age, gender, nationality, ethnicity, religion, disability, family status or any other protected characteristic.`;

export type ScreenInput = {
  posting: string;
  title: string;
  company: string;
  /** What the user is looking for, as the search profile states it. */
  criteria: string;
  profile: ProfileData;
};

const MAX_REASONS = 3;
const MAX_LENGTH = 300;

/** The answer, trusting nothing: short, non-empty reasons within their limit. */
export function screenPostingFrom(answer: ScreenAnswer): ScreenPosting {
  const reasons = answer.reasons
    .map((reason) => reason.trim().slice(0, MAX_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_REASONS);
  return {
    ...answer,
    reasons: reasons.length > 0 ? reasons : ["The model gave no reasons for this verdict."],
  };
}

/** The cheap screen: shortlist or skip, with reasons. Contact details and references are never sent. */
export const screenPosting: Task<ScreenInput, ScreenPosting> = async (provider, input, { signal }) => {
  const { posting, title, company, criteria, profile } = input;
  const answer = await provider.complete({
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
          `What the candidate is looking for:\n${criteria.trim().slice(0, 2_000)}`,
          `The posting's facts:\n${JSON.stringify({ title, company }, null, 2)}`,
          `The posting:\n${postingForPrompt(posting)}`,
        ].join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "screen_posting",
    // Judging, not writing: faithful, and no long think before answering.
    creativity: "FAITHFUL",
    effort: "low",
    signal,
  });
  return { data: screenPostingFrom(answer), promptVersion: SCREEN_POSTING_VERSION };
};
