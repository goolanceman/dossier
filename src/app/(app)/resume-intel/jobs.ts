import "server-only";

import { z } from "zod";

import { getProviderForTask } from "@/lib/ai/routing";
import { loadTaskOptions } from "@/lib/ai/task-options";
import { resumeCritique } from "@/lib/ai/tasks";
import { getTarget } from "@/lib/career/targets";
import { defineJob } from "@/lib/jobs/runner";
import { loadProfile } from "@/lib/profile-data";
import { MAX_RESUME_CHARACTERS } from "@/lib/resume-text";
import { saveCritique } from "@/lib/resume-intel/critique";

import { CRITIQUE_STEPS } from "./view";

/**
 * Critiques a resume (master.md §5.1): the text comes from the upload route
 * or from the paste box, the critique task judges it the way an ATS, a
 * writer and a recruiter would, and the answer is stored verbatim so every
 * recommendation stays checkable against the resume text beside it.
 */
export const critiqueResumeJob = defineJob({
  type: "critique-resume",
  input: z.object({
    content: z.string().min(1).max(MAX_RESUME_CHARACTERS),
    fileName: z.string().max(200).default(""),
    targetId: z.string().max(50).default(""),
  }),
  result: z.object({ critiqueId: z.string() }),
  async run({ content, fileName, targetId }, { step, signal }) {
    await step(CRITIQUE_STEPS[0]);
    const [provider, options, profile] = await Promise.all([getProviderForTask("resume-critique"), loadTaskOptions(), loadProfile()]);
    // A target deleted in the meantime falls back to a general critique, so a retry still works.
    const target = targetId ? await getTarget(targetId) : null;

    await step(CRITIQUE_STEPS[1]);
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
    const critiqueId = await saveCritique({ fileName, content, critique: data, critiquedWith: promptVersion, targetId: target?.id });
    return { critiqueId };
  },
});

export type CritiqueResumeResult = z.infer<typeof critiqueResumeJob.result>;
