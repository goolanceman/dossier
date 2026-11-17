import "server-only";

import type { JobSearchProfile } from "@/generated/prisma/client";
import { isAiConfigured } from "@/lib/ai/config";
import { profileQuerySchema } from "@/lib/discovery/profile";
import type { ExternalSourceView } from "@/lib/discovery/external";
import { credentialsFor, type JobSearchConfig } from "@/lib/job-search/config";
import { JobSearchError } from "@/lib/job-search/errors";
import { AI_PROVIDER_MISSING } from "@/lib/scoring";

// Why a profile can't run yet, in the same words Find jobs and the agent
// use: the AI provider for the screen and assess stages, the source's key
// (credentialsFor), or an external source that's gone or off. The page and
// the Run now action both ask here, so a run is never started that would
// fail at once.

/**
 * The problem to fix before this profile can run, or null when it's ready.
 * The AI check is skipped when the profile skips both AI stages.
 */
export async function profileRunProblem(
  profile: JobSearchProfile,
  config: JobSearchConfig,
  sources: readonly ExternalSourceView[],
): Promise<string | null> {
  const query = profileQuerySchema.safeParse(profile.query);
  const skip = query.success ? new Set(query.data.skipStages) : new Set<string>();
  if (!(skip.has("SCREENED") && skip.has("ASSESSED")) && !(await isAiConfigured())) return AI_PROVIDER_MISSING;
  if (query.success && query.data.externalSourceId) {
    const source = sources.find((candidate) => candidate.id === query.data.externalSourceId);
    if (!source || !source.enabled) return `The external source "${query.data.externalSourceId}" isn't set up or is off.`;
    return null;
  }
  try {
    credentialsFor(config, profile.source);
  } catch (error) {
    if (error instanceof JobSearchError) return error.message;
    throw error;
  }
  return null;
}
