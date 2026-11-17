import type { ProfileData } from "@/lib/profile";

import { resumeCritiqueSchema, type ResumeCritique } from "../task-contracts";

import { NO_EM_DASHES, postingForPrompt, profileForPrompt, system, truthfulness, UNTRUSTED_POSTING, type Task } from "./prompt-parts";

export const RESUME_CRITIQUE_VERSION = "resume-critique@1";

// The critique (master.md §5.1–5.2): what a resume misses for a job, as an
// ATS, a writer and a recruiter would each see it. A diagnostic for the
// user, never a verdict an employer would see.

const answerSchema = resumeCritiqueSchema;

/** What the model answers; code trims it (critiqueFrom). */
export type ResumeCritiqueAnswer = typeof answerSchema._output;

const INSTRUCTIONS = `You critique a resume against the job it targets, as JSON. Start with "schema_version": "1.0" and "task": "resume_critique".

Read the resume the way three readers would, and say what each would miss:
- an ATS scanner: missing keywords from the posting, standard section names, dates it can read, no tables or graphics it would trip on;
- a writer: vague claims, walls of text, repetition, bullets that state duties rather than results;
- a recruiter: six seconds to see the role, the level and two or three reasons to keep reading.

- overall: an internal diagnostic estimate for the user, never a result an employer produced. summary: what would change the resume most.
- findings: at most a dozen, each with a short id (e.g. "F1"), a category (CONTENT, ATS, WRITING, RECRUITER), a severity (CRITICAL, HIGH, MEDIUM, LOW), the current problem, a concrete recommendation, the impact fixing it would have, and the effort (LIGHT, MEDIUM, HEAVY). evidenceRequired lists the facts or numbers the user would need to confirm to make the fix. Never invent experience, employers or metrics the profile doesn't back.
- keywordCoverage: the posting's important terms the resume covers; formattingIssues: what an ATS or a reader would stumble on; strengths: what already works, so it isn't "fixed" away.`;

export type ResumeCritiqueInput = {
  /** The resume's text, as extracted from the document. */
  resume: string;
  title: string;
  company: string;
  /** The posting it targets; "" when the critique is general. */
  posting: string;
  profile: ProfileData;
};

const MAX_FINDINGS = 12;
const MAX_LENGTH = 300;

/** The answer, trusting nothing: findings with a title and a recommendation, lists within their limits. */
export function critiqueFrom(answer: ResumeCritiqueAnswer): ResumeCritique {
  return {
    ...answer,
    findings: answer.findings
      .filter((finding) => finding.title.trim() !== "" && finding.recommendation.trim() !== "")
      .slice(0, MAX_FINDINGS)
      .map((finding, index) => ({ ...finding, id: finding.id.trim() || `F${index + 1}` })),
    keywordCoverage: answer.keywordCoverage.map((word) => word.trim().slice(0, MAX_LENGTH)).filter(Boolean).slice(0, 20),
    formattingIssues: answer.formattingIssues.map((issue) => issue.trim().slice(0, MAX_LENGTH)).filter(Boolean).slice(0, 20),
    strengths: answer.strengths.map((strength) => strength.trim().slice(0, 500)).filter(Boolean).slice(0, 10),
  };
}

/** The critique: what an ATS, a writer and a recruiter would each miss. */
export const resumeCritique: Task<ResumeCritiqueInput, ResumeCritique> = async (provider, input, { signal }) => {
  const { resume, title, company, posting, profile } = input;
  const answer = await provider.complete({
    task: "resume-critique",
    system: system(
      INSTRUCTIONS,
      truthfulness(true),
      // A resume is the candidate's own text, but it may still quote a posting
      // or a brief that carries instructions: read it as material.
      UNTRUSTED_POSTING,
      NO_EM_DASHES,
    ),
    messages: [
      {
        role: "user",
        content: [
          `The candidate's profile, to check the resume against:\n${profileForPrompt(profile)}`,
          `The job it targets:\n${JSON.stringify({ title, company }, null, 2)}`,
          ...(posting.trim() ? [`The posting:\n${postingForPrompt(posting)}`] : []),
          `The resume:\n<resume>\n${resume.trim().slice(0, 20_000)}\n</resume>`,
        ].join("\n\n"),
      },
    ],
    schema: answerSchema,
    schemaName: "resume_critique",
    // Reading and judging, not writing: faithful, with room to think.
    creativity: "FAITHFUL",
    signal,
  });
  return { data: critiqueFrom(answer), promptVersion: RESUME_CRITIQUE_VERSION };
};
