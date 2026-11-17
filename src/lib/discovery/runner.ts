import "server-only";

import { z } from "zod";

import { defineJob, findUnfinishedJobs, startJob } from "@/lib/jobs/runner";

import { runDiscoveryPipeline, runStatsSchema, type AssessFn, type ScreenFn } from "./pipeline";
import { dueProfiles } from "./profile";

// The discovery run as a background job (master.md §2.3), on the existing
// runner: steps, cancel, retry and SSE come with it. The AI stages are
// injected once at startup through setPipelineHooks, so this module stays
// free of the AI wiring; without hooks the pipeline shortlists by keyword
// score and leaves assessments pending.

type PipelineHooks = { screen?: ScreenFn; assess?: AssessFn };

// On globalThis, so the dev server's hot reloads keep the one wiring.
const globalForDiscovery = globalThis as unknown as { discoveryHooks?: PipelineHooks };

/** Wires the AI stages in: called once at startup with the screen and assess task wrappers. */
export function setPipelineHooks(hooks: PipelineHooks): void {
  globalForDiscovery.discoveryHooks = hooks;
}

const hooks = (): PipelineHooks => globalForDiscovery.discoveryHooks ?? {};

/** Keyed per profile, so the schedule and a manual run find one that's queued or running. */
export const discoveryJobKey = (profileId: string) => `discovery:${profileId}`;

/** One run of one search profile: fetch, deterministic filter, keywords, then whatever AI the wiring injected. */
export const discoveryRunJob = defineJob({
  type: "discovery-run",
  input: z.object({ profileId: z.string(), manual: z.boolean() }),
  result: runStatsSchema,
  run: (input, context) => runDiscoveryPipeline({ ...input, ...hooks() }, context),
});

/**
 * Queues a run for every enabled profile whose schedule is due, each with
 * its own key. Job locking: a profile with a queued or running job waits
 * for the next check, whatever asked for the run.
 */
export async function runDueProfiles(now: Date = new Date()): Promise<string[]> {
  const queued: string[] = [];
  for (const profile of await dueProfiles(now)) {
    const key = discoveryJobKey(profile.id);
    if ((await findUnfinishedJobs(key)).length > 0) continue;
    await startJob(discoveryRunJob, { profileId: profile.id, manual: false }, { key });
    queued.push(profile.id);
  }
  return queued;
}
