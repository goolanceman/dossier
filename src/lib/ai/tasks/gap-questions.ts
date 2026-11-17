import type { ProfileData } from "@/lib/profile";

import { gapQuestionsSchema, type GapQuestions } from "../task-contracts";

import { NO_EM_DASHES, postingForPrompt, profileForPrompt, system, truthfulness, UNTRUSTED_POSTING, type Task } from "./prompt-parts";

export const GAP_QUESTIONS_VERSION = "gap-questions@1";

// The gap questions (master.md Phase 6): what only the candidate knows and
// the profile doesn't, asked before writing anything on it.

const answerSchema = gapQuestionsSchema;

/** What the model answers; code drops what the profile already answers (gapQuestionsFrom). */
export type GapQuestionsAnswer = typeof answerSchema._output;

const INSTRUCTIONS = `You find what a job asks for that the candidate's profile doesn't answer, and ask for it, as JSON. Start with "schema_version": "1.0" and "task": "gap_questions".

Ask only what the posting needs and the profile doesn't show:
- each question names the requirement it belongs to (relatedRequirement) and what an answer would give (expectedInformation), so the candidate can answer in one line;
- questionType: TECHNICAL, ACHIEVEMENT, METRICS, LEADERSHIP, PROJECT, BUSINESS or CLARIFICATION;
- priority: CRITICAL for a must-have requirement nothing in the profile speaks to, HIGH for one it barely speaks to, MEDIUM or LOW for the rest;
- alreadyKnown: true only when the profile already answers the question well enough to use. A question the profile answers is not asked.

Never invent experience, employers, metrics or skills, and never ask about age, gender, nationality, ethnicity, religion, disability, family status or any other protected characteristic. Fewer, sharper questions beat a long list.`;

export type GapQuestionsInput = {
  posting: string;
  title: string;
  company: string;
  profile: ProfileData;
};

/** The answer, trusting nothing: nothing the profile already answers, and ids the code can trust. */
export function gapQuestionsFrom(answer: GapQuestionsAnswer): GapQuestions {
  return {
    ...answer,
    // What the profile already answers is not asked, whatever the model said.
    questions: answer.questions
      .filter((question) => question.alreadyKnown === false && question.question.trim() !== "")
      .map((question, index) => ({ ...question, question: question.question.trim(), id: `q${index + 1}` })),
  };
}

/** The gap questions: what only the candidate knows, sharpest first. */
export const gapQuestions: Task<GapQuestionsInput, GapQuestions> = async (provider, input, { signal }) => {
  const { posting, title, company, profile } = input;
  const answer = await provider.complete({
    task: "gap-questions",
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
          `The job:\n${JSON.stringify({ title, company }, null, 2)}`,
          `The posting:\n${postingForPrompt(posting)}`,
        ].join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "gap_questions",
    // Judging, not writing: faithful, and no long think before answering.
    creativity: "FAITHFUL",
    effort: "low",
    signal,
  });
  return { data: gapQuestionsFrom(answer), promptVersion: GAP_QUESTIONS_VERSION };
};
