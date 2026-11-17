"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { EXTERNAL_SOURCE_PREFIX, externalSourceSettingSchema, listExternalSourceSettings, safeExternalUrl } from "@/lib/discovery/external";
import { createProfile, deleteProfile, getProfile, searchProfileInputSchema, setEnabled, updateProfile, type SearchProfileParams } from "@/lib/discovery/profile";
import { discoveryJobKey, discoveryRunJob } from "@/lib/discovery/runner";
import { loadJobSearchConfig } from "@/lib/job-search/config";
import { findUnfinishedJobs, startJob } from "@/lib/jobs/runner";
import { prisma } from "@/lib/prisma";

import { profileRunProblem } from "./gates";

// The Discovery screen's actions (master.md Phase 2): search profiles and
// the external sources they can search, and Run now. The external sources
// are Setting rows ("discovery:external:<id>"), like the job-intel weights
// keep theirs; src/lib/settings.ts stays out of it.

const profileId = z.string().min(1).max(100);

/**
 * Creates a profile, or rewrites the one named by `id` (master.md §2.2). The
 * form validated itself first; the first issue's message is what the user
 * sees. The profile goes on as it came: createProfile and updateProfile
 * parse it again, and only an explicit empty time zone is normalized away,
 * since it's the schema's default and its own refine wants it absent.
 */
export const saveSearchProfile = action(z.object({ id: profileId.optional(), profile: z.record(z.string(), z.unknown()) }), async ({ id, profile }) => {
  const raw = { ...profile };
  if (raw.timeZone === "") delete raw.timeZone;
  const parsed = searchProfileInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ActionError(issue ? issue.message : "The profile's fields didn't come out right. Check them and try again.");
  }
  if (id) {
    const updated = await updateProfile(id, raw as SearchProfileParams);
    if (!updated) throw new ActionError("That profile is gone. It may have been deleted already.");
  } else {
    await createProfile(raw as SearchProfileParams);
  }
  revalidatePath("/discovery");
  return null;
});

export const deleteSearchProfile = action(z.object({ id: profileId }), async ({ id }) => {
  const deleted = await deleteProfile(id);
  if (!deleted) throw new ActionError("That profile is gone. It may have been deleted already.");
  revalidatePath("/discovery");
  return null;
});

/** Turns a profile on or off. Off, it never comes due on the schedule. */
export const setProfileEnabled = action(z.object({ id: profileId, enabled: z.boolean() }), async ({ id, enabled }) => {
  const updated = await setEnabled(id, enabled);
  if (!updated) throw new ActionError("That profile is gone. It may have been deleted already.");
  revalidatePath("/discovery");
  return null;
});

/**
 * Run now: queues a run for one profile, reusing one already queued or
 * running. What the page would also say before it — a missing key, an AI
 * provider, an external source — fails here with the same words.
 */
export const runProfileNow = action(z.object({ id: profileId }), async ({ id }) => {
  const profile = await getProfile(id);
  if (!profile) throw new ActionError("That profile is gone. It may have been deleted already.");
  const problem = await profileRunProblem(profile, await loadJobSearchConfig(), await listExternalSourceSettings());
  if (problem) throw new ActionError(problem);
  const key = discoveryJobKey(id);
  const [unfinished] = await findUnfinishedJobs(key);
  if (unfinished) return { jobId: unfinished.id, reused: true };
  const jobId = await startJob(discoveryRunJob, { profileId: id, manual: true }, { key });
  revalidatePath("/discovery");
  return { jobId, reused: false };
});

// ─── External sources (master.md §2.1) ───────────────────────────────────────

const settingKey = (id: string) => `${EXTERNAL_SOURCE_PREFIX}${id}`;

/** A source as the form sends it. The id is the Setting key's name, so lower-case letters, digits and dashes. */
const externalSourceInput = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Use lower-case letters, digits and dashes for the source's name."),
  kind: z.enum(["HTTP_SCRAPER", "APIFY"]),
  url: z.string().trim().max(2000).default(""),
  token: z.string().max(2000).default(""),
  actorId: z.string().trim().max(200).default(""),
  label: z.string().trim().min(1).max(200),
  enabled: z.boolean().default(true),
});

/** Saves a source. An empty token keeps the saved one: tokens are never sent back to the screen. */
export const saveExternalSource = action(externalSourceInput, async (input) => {
  if (input.kind === "HTTP_SCRAPER") {
    if (!input.url) throw new ActionError("Give the scraper's web address.");
    if (!safeExternalUrl(input.url)) throw new ActionError("The scraper's address isn't a public web address. Check it in the discovery sources.");
  } else {
    if (!input.actorId) throw new ActionError("Give the Apify actor's id, e.g. “someone~my-scraper”.");
    if (!input.token) throw new ActionError("Give the Apify token.");
  }
  const key = settingKey(input.id);
  let token = input.token;
  if (!token) {
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (existing) {
      try {
        const parsed = externalSourceSettingSchema.safeParse(JSON.parse(existing.value));
        if (parsed.success) token = parsed.data.token;
      } catch {
        // A saved row that isn't JSON has no token to keep.
      }
    }
  }
  const value = JSON.stringify(externalSourceSettingSchema.parse({ ...input, token }));
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  revalidatePath("/discovery");
  return null;
});

export const deleteExternalSource = action(z.object({ id: profileId }), async ({ id }) => {
  await prisma.setting.deleteMany({ where: { key: settingKey(id) } });
  revalidatePath("/discovery");
  return null;
});
