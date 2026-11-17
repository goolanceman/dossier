import type { ProfileData } from "@/lib/profile";

import { interviewPrepSchema, type InterviewPrep } from "../task-contracts";

import { NO_EM_DASHES, postingForPrompt, profileForPrompt, system, truthfulness, UNTRUSTED_POSTING, type Task } from "./prompt-parts";

export const INTERVIEW_PREP_VERSION = "interview-prep@1";

// Interview preparation (master.md Phase 7): the questions to expect, what a
// good answer draws on, and where the candidate stands. Predicted, never
// the company's actual questions.

const answerSchema = interviewPrepSchema;

/** What the model answers; code checks the evidence ids and the resources (interviewPrepFrom). */
export type InterviewPrepAnswer = typeof answerSchema._output;

const INSTRUCTIONS = `You prepare a candidate for interviewing for a job, as JSON. Start with "schema_version": "1.0" and "task": "interview_preparation".

The questions are PREDICTED and REPRESENTATIVE ones for this kind of role, stage and company: the kind interviewers at companies like this ask. They are never the company's actual questions, and nothing here says otherwise.

- questions: for a full plan, the stages the candidate is likely to face (recruiter screen, HR, hiring manager, technical, system design, architecture, culture); for a single stage, that stage's questions. Each names its category and difficulty (BEGINNER, INTERMEDIATE, ADVANCED, SENIOR, STAFF), why interviewers ask it (whyAsked), the posting requirement it relates to (relatedRequirement, "" when none), the topics a strong answer covers (expectedTopics), and how to structure the answer (answerStructure).
- evidenceIds: the candidate's achievements, by their ids and only those, that the answer can draw on. An answer with nothing from the profile behind it is a warning, not a plan.
- followUps: the questions an interviewer asks next; commonMistakes: what weak answers get wrong.
- resources: topics to read up on, named plainly ("vault topology", "OAuth flows"). Never a URL: none are known.
- readiness: how ready the profile shows the candidate to be, as a score from 0 to 100 or null when it's too thin to say, with the reasoning.

Never invent experience, employers, metrics or credentials, and never use age, gender, nationality, ethnicity, religion, disability, family status or any other protected characteristic.`;

export type InterviewPrepInput = {
  title: string;
  company: string;
  posting: string;
  profile: ProfileData;
  /** The evidence library the answers may draw on, by id (master.md §12.5). */
  achievements: { id: string; title: string; summary: string }[];
  /** The stage to prepare for, e.g. "technical"; "" for a plan across stages. */
  stage: string;
};

const URL_LIKE = /\bhttps?:\/\/|^\s*\w+:\/\//i;
const MAX_QUESTIONS = 15;

/** The answer, trusting nothing: evidence ids only from the library, resources as topics, never as URLs. */
export function interviewPrepFrom(answer: InterviewPrepAnswer, achievementIds: string[]): InterviewPrep {
  const allowed = new Set(achievementIds);
  return {
    ...answer,
    questions: answer.questions
      .filter((question) => question.question.trim() !== "")
      .slice(0, MAX_QUESTIONS)
      .map((question) => ({
        ...question,
        evidenceIds: question.evidenceIds.filter((id) => allowed.has(id)),
        // A topic to read, never an address the model made up (master.md §12.5).
        resources: question.resources.filter((resource) => !URL_LIKE.test(resource)),
      })),
    preparationTopics: answer.preparationTopics.filter((topic) => !URL_LIKE.test(topic)).slice(0, 20),
  };
}

/** The interview preparation: predicted questions, structured answers, evidence to draw on. */
export const interviewPrep: Task<InterviewPrepInput, InterviewPrep> = async (provider, input, { signal }) => {
  const { title, company, posting, profile, achievements, stage } = input;
  const answer = await provider.complete({
    task: "interview-prep",
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
            ? `The candidate's achievements, by id, that answers can draw on:\n${JSON.stringify(achievements, null, 2)}`
            : "The candidate has no verified achievements yet: evidenceIds stays empty.",
          `The job:\n${JSON.stringify({ title, company, stage: stage || "all stages" }, null, 2)}`,
          `The posting:\n${postingForPrompt(posting)}`,
        ].join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "interview_preparation",
    // Planning, not writing: faithful wording, with room to think.
    creativity: "FAITHFUL",
    signal,
  });
  return { data: interviewPrepFrom(answer, achievements.map((achievement) => achievement.id)), promptVersion: INTERVIEW_PREP_VERSION };
};
