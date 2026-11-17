"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { EvidenceStatus } from "@/generated/prisma/enums";
import { action, ActionError } from "@/lib/action";
import {
  achievementInputSchema,
  createAchievement,
  deleteAchievement,
  promoteToVerified,
  reorderAchievements,
  setStatus,
  updateAchievement,
} from "@/lib/career/achievements";
import { createDoc, deleteDoc, docInputSchema, getDoc, updateDoc } from "@/lib/career/knowledge";
import { deleteCareerPlan, setActionDone } from "@/lib/career/plan";
import { createTarget, deleteTarget, getTarget, listTargets, reorderTargets, updateTarget } from "@/lib/career/targets";
import { startJob } from "@/lib/jobs/runner";

import { careerPlanJob, reviewKnowledgeDocJob } from "./jobs";

// The career screen's actions (master.md Phase 1): thin wrappers around the
// lib functions, signed in and validated. Statuses VERIFIED, USER_CONFIRMED
// and REJECTED are set only through these user actions, never by the AI.

const idSchema = z.object({ id: z.string().min(1) });

const withRefresh = () => revalidatePath("/career");

// ── Achievements (master.md §1.2) ────────────────────────────────────────────

/** Creates an achievement, or saves the edits to one. The user typed it, so its origin says "user". */
export const saveAchievement = action(achievementInputSchema.extend({ id: z.string().min(1).optional() }), async ({ id, ...input }) => {
  const saved = id ? await updateAchievement(id, input) : await createAchievement(input, { origin: "user" });
  withRefresh();
  return saved;
});

/** "Mark verified": the user checked the achievement against its source (the only path to VERIFIED). */
export const verifyAchievement = action(idSchema, async ({ id }) => {
  const saved = await promoteToVerified(id);
  withRefresh();
  return saved;
});

/** Sets any other status the user asks for: "Needs clarification" or "Reject" (or back off Verified). */
export const setAchievementStatus = action(idSchema.extend({ status: z.enum(EvidenceStatus) }), async ({ id, status }) => {
  const saved = await setStatus(id, status);
  withRefresh();
  return saved;
});

/** Removes an achievement for good. */
export const removeAchievement = action(idSchema, async ({ id }) => {
  await deleteAchievement(id);
  withRefresh();
  return null;
});

/** Sets the list order to the given ids, all of them. */
export const moveAchievements = action(z.object({ ids: z.array(z.string().min(1)).min(1) }), async ({ ids }) => {
  await reorderAchievements(ids);
  withRefresh();
  return null;
});

// ── Targets (master.md §1.1) ─────────────────────────────────────────────────

const targetFormSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Give the target a title.").max(200),
  summary: z.string().max(2_000),
  seniority: z.string().max(100),
  salaryMin: z.number().int().min(0).nullable(),
  currency: z.string().max(10),
  remoteCountries: z.array(z.string().max(100)).max(30),
  priorities: z.array(z.string().max(300)).max(10),
  keywords: z.array(z.string().max(100)).max(30),
});

/** Creates a target, or saves the edits to one. The first target is primary automatically. */
export const saveTarget = action(
  targetFormSchema,
  async ({ id, title, summary, seniority, salaryMin, currency, remoteCountries, priorities, keywords }) => {
    const preferences = { seniority, salaryMin, currency, remoteCountries, priorities, keywords };
    const saved = id ? await updateTarget(id, { title, summary, preferences }) : await createTarget({ title, summary, preferences });
    withRefresh();
    return saved;
  },
);

/** Makes this the one primary target; the old one is demoted. */
export const setPrimaryTarget = action(idSchema, async ({ id }) => {
  const saved = await updateTarget(id, { primary: true });
  withRefresh();
  return saved;
});

/** Removes a target for good. A primary target hands primary over to the first one left. */
export const removeTarget = action(idSchema, async ({ id }) => {
  const wasPrimary = (await getTarget(id))?.primary ?? false;
  await deleteTarget(id);
  if (wasPrimary) {
    const [next] = await listTargets();
    if (next) await updateTarget(next.id, { primary: true });
  }
  withRefresh();
  return null;
});

/** Sets the list order to the given ids, all of them. */
export const moveTargets = action(z.object({ ids: z.array(z.string().min(1)).min(1) }), async ({ ids }) => {
  await reorderTargets(ids);
  withRefresh();
  return null;
});

// ── Knowledge base (master.md §1.3) ──────────────────────────────────────────

/** Adds a document from pasted text, or saves the edits to one. */
export const saveDoc = action(docInputSchema.extend({ id: z.string().min(1).optional() }), async ({ id, ...input }) => {
  const saved = id ? await updateDoc(id, input) : await createDoc(input);
  withRefresh();
  return saved;
});

/** Removes a document for good. The achievements made from it stay in the library. */
export const removeDoc = action(idSchema, async ({ id }) => {
  await deleteDoc(id);
  withRefresh();
  return null;
});

/** "Review": reads the document with the AI in the background; the screen follows the job's id. */
export const reviewDoc = action(idSchema, async ({ id }) => {
  const doc = await getDoc(id);
  if (!doc) throw new ActionError("The document is no longer there.");
  if (doc.content.trim() === "") throw new ActionError("This document has no text to review. Paste its content first.");
  return { jobId: await startJob(reviewKnowledgeDocJob, { docId: id }, { key: `knowledge-doc:${id}` }) };
});

// ── Career plan (master.md Phase 5 extension) ─────────────────────────────────

const basedOnSchema = z.enum(["RESUME", "PROFILE", "ASSESSMENT"]);

/** "Generate plan": the AI draws the goals in the background; the screen follows the job's id. */
export const generateCareerPlan = action(
  z.object({ basedOn: basedOnSchema, targetId: z.string().max(50).optional() }),
  async ({ basedOn, targetId }) => {
    return { jobId: await startJob(careerPlanJob, { basedOn, ...(targetId ? { targetId } : {}) }, { key: "career-plan" }) };
  },
);

/** Checks or unchecks one action of a plan. */
export const toggleAction = action(
  z.object({ planId: z.string().min(1), actionId: z.string().min(1), done: z.boolean() }),
  async ({ planId, actionId, done }) => {
    const saved = await setActionDone(planId, actionId, done);
    if (!saved) throw new ActionError("The plan is no longer there.");
    withRefresh();
    return saved;
  },
);

/** Removes a plan for good. The achievements it pointed at stay in the library. */
export const removePlan = action(idSchema, async ({ id }) => {
  await deleteCareerPlan(id);
  withRefresh();
  return null;
});
