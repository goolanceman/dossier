import "server-only";

import { z } from "zod";

import { careerPlanSchema } from "@/lib/ai/task-contracts";
import { readItems, type PlanGoal } from "./plan-items";
import type { CareerPlan } from "@/generated/prisma/client";
import type { ProfileData } from "@/lib/profile";
import { prisma } from "@/lib/prisma";

// Career plans (master.md Phase 5 extension: "on the basis of resume ai can
// generate the career goals plan"). The goals and risks come from the
// validated career_plan task and are stored verbatim in the items column;
// the only thing the user changes afterwards is which actions are done.

// The items' shapes and summaries live in plan-items.ts (client-safe); this
// module adds the database CRUD.

export { planItemsSchema, planSummary, readItems, type PlanGoal, type PlanSummary } from "./plan-items";

/** What a stored plan shows: the items column read back as data, with the target's title when one is linked. */
export type CareerPlanView = Omit<CareerPlan, "items"> & {
  items: { goals: PlanGoal[]; risks: string[] };
  target: { title: string } | null;
};

function toView(row: CareerPlan & { target: { title: string } | null }): CareerPlanView {
  return { ...row, items: readItems(row.items) };
}

/** Whether the profile has enough on it for a resume to exist (the base resume is built from it). */
export function hasResumeContent(profile: ProfileData): boolean {
  return profile.experience.length > 0 || profile.projects.length > 0;
}

/** The goals part of the career_plan contract, re-checked on write. */
const contractGoalSchema = careerPlanSchema.shape.goals.element;

/** What the career_plan task (or a test) saves: the goals and risks of one plan. Left-out fields take the defaults. */
export const careerPlanInputSchema = z.object({
  basedOn: z.enum(["RESUME", "PROFILE", "ASSESSMENT"]),
  headline: z.string().max(300).default(""),
  summary: z.string().max(2_000).default(""),
  // The contract's own goal shape: the task has validated it already, and this re-checks it.
  goals: z.array(contractGoalSchema).max(12),
  risks: z.array(z.string().max(500)).max(8).default([]),
  planWith: z.string().max(100).default(""),
  targetId: z.string().min(1).optional(),
  critiqueId: z.string().min(1).optional(),
});
export type CareerPlanInput = z.input<typeof careerPlanInputSchema>;

/** Stores a plan. The items column keeps the contract's markers beside the goals and risks. */
export async function createCareerPlan(input: CareerPlanInput): Promise<CareerPlanView> {
  const parsed = careerPlanInputSchema.parse(input);
  const row = await prisma.careerPlan.create({
    data: {
      basedOn: parsed.basedOn,
      headline: parsed.headline,
      summary: parsed.summary,
      items: { schema_version: "1.0", task: "career_plan", goals: parsed.goals, risks: parsed.risks },
      planWith: parsed.planWith,
      // An empty or unknown target means no target; the relation is optional.
      targetId: parsed.targetId ?? null,
      ...(parsed.critiqueId ? { critiqueId: parsed.critiqueId } : {}),
    },
    include: { target: { select: { title: true } } },
  });
  return toView(row);
}

/** The plans, newest first, each with its target's title when one is linked. */
export async function listCareerPlans(): Promise<CareerPlanView[]> {
  const rows = await prisma.careerPlan.findMany({ orderBy: { createdAt: "desc" }, include: { target: { select: { title: true } } } });
  return rows.map(toView);
}

export async function getCareerPlan(id: string): Promise<CareerPlanView | null> {
  const row = await prisma.careerPlan.findUnique({ where: { id }, include: { target: { select: { title: true } } } });
  return row ? toView(row) : null;
}

export async function deleteCareerPlan(id: string): Promise<void> {
  await prisma.careerPlan.delete({ where: { id } });
}

/**
 * Checks or unchecks one action of a plan (matched by action id), saving the
 * items back. A plan that is gone returns null; an action id the plan does
 * not have changes nothing.
 */
export async function setActionDone(planId: string, actionId: string, done: boolean): Promise<CareerPlanView | null> {
  const row = await prisma.careerPlan.findUnique({ where: { id: planId }, include: { target: { select: { title: true } } } });
  if (!row) return null;
  const { goals, risks } = readItems(row.items);
  // One action id may repeat across goals; every instance flips together.
  const nextGoals = goals.map((goal) => ({
    ...goal,
    actions: goal.actions.map((action) => (action.id === actionId ? { ...action, done } : action)),
  }));
  // An id no goal has changes nothing, so nothing is written back either.
  if (!nextGoals.some((goal) => goal.actions.some((action) => action.id === actionId))) return toView(row);
  const saved = await prisma.careerPlan.update({
    where: { id: planId },
    data: { items: { schema_version: "1.0", task: "career_plan", goals: nextGoals, risks } },
    include: { target: { select: { title: true } } },
  });
  return toView(saved);
}

/** What a list row shows: goals per horizon, and the actions done out of all of them. */


