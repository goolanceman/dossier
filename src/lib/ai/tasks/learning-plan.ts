import { learningPlanSchema, type LearningPlanResult } from "../task-contracts";

import { NO_EM_DASHES, system, type Task } from "./prompt-parts";

export const LEARNING_PLAN_VERSION = "learning-plan@1";

// A learning plan (master.md Phase 8) for the gaps a job or a target needs
// closed: ordered topics, each with practice, and topics to read up on. The
// plan proposes; nothing is enrolled or verified.

const answerSchema = learningPlanSchema;

/** What the model answers; code trims it (learningPlanFrom). */
export type LearningPlanAnswer = typeof answerSchema._output;

const INSTRUCTIONS = `You plan what a candidate should learn for a goal, as JSON. Start with "schema_version": "1.0" and "task": "learning_plan".

- topics: in the order to learn them, each small enough to finish in a sitting or two. prerequisites names earlier topics in this plan, or things already known.
- effortHours: the hours one topic takes, from 1 to 40, in keeping with the weekly hours the candidate has.
- exercises: how to practise the topic, each exercise something the candidate can actually do; miniProjects: something small to build that uses it;
- interviewQuestions: the questions about this topic an interviewer is likely to ask, so practising it doubles as interview practice.
- resources: topics to search for ("Postgres query plans", "system design primers"), named plainly. Never a URL: none are known.

Skip what the candidate already knows, and never invent their experience: the plan teaches, it doesn't assume.`;

export type LearningPlanInput = {
  /** What the plan should achieve, e.g. a gap between the candidate and a target role. */
  goal: string;
  /** What the candidate already has, so the plan skips it. */
  known: string[];
  /** Hours a week the candidate can study; 0 when they haven't said. */
  weeklyHours: number;
};

const MAX_HOURS = 40;

/** The answer, trusting nothing: topics with a title and plain-topic resources, hours within 1 to 40. */
export function learningPlanFrom(answer: LearningPlanAnswer): LearningPlanResult {
  const topicName = (resource: string) => resource.trim().slice(0, 200);
  const plainTopics = (resources: string[]) =>
    resources.map(topicName).filter((topic) => topic !== "" && !/\bhttps?:\/\//i.test(topic)).slice(0, 5);
  return {
    ...answer,
    goal: answer.goal.trim().slice(0, 1_000),
    topics: answer.topics
      .filter((topic) => topic.title.trim() !== "")
      .map((topic) => ({
        ...topic,
        title: topic.title.trim().slice(0, 300),
        effortHours: Math.min(MAX_HOURS, Math.max(1, Math.round(Number.isFinite(topic.effortHours) ? topic.effortHours : 1))),
        exercises: topic.exercises.map(topicName).filter(Boolean).slice(0, 5),
        miniProjects: topic.miniProjects.map(topicName).filter(Boolean).slice(0, 3),
        interviewQuestions: topic.interviewQuestions.map(topicName).filter(Boolean).slice(0, 5),
        resources: plainTopics(topic.resources),
      })),
  };
}

/** The learning plan: ordered topics with practice, projects and questions. */
export const learningPlan: Task<LearningPlanInput, LearningPlanResult> = async (provider, input, { signal }) => {
  const { goal, known, weeklyHours } = input;
  const answer = await provider.complete({
    system: system(
      INSTRUCTIONS,
      "Build only on what the goal and the candidate's existing skills say; never assume experience they haven't shown.",
      NO_EM_DASHES,
    ),
    messages: [
      {
        role: "user",
        content: [
          `The goal:\n${goal.trim().slice(0, 2_000)}`,
          known.length > 0 ? `The candidate already has:\n${known.map((skill) => `- ${skill}`).join("\n")}` : "Nothing is known yet.",
          weeklyHours > 0 ? `The candidate can study about ${weeklyHours} hours a week.` : "The candidate hasn't said how many hours a week they can study.",
        ].join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "learning_plan",
    // Planning, not writing: faithful wording, with room to think.
    creativity: "FAITHFUL",
    signal,
  });
  return { data: learningPlanFrom(answer), promptVersion: LEARNING_PLAN_VERSION };
};
