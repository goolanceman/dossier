import { z } from "zod";

import { careerPlanSchema } from "@/lib/ai/task-contracts";

// The client-safe half of career plans: the items' shapes (derived from the
// career_plan contract, never re-defined) and their summaries. No prisma and
// no server-only here, so screens can import it; the CRUD lives in plan.ts.

/** One action of a goal, with the user's done flag (the contract has none; it is the user's, so it is stored anyway). */
export const planActionSchema = careerPlanSchema.shape.goals.element.shape.actions.element.extend({ done: z.boolean().optional() });
export type PlanAction = z.output<typeof planActionSchema>;

/** One goal of a plan, with its actions as stored. */
export const planGoalSchema = careerPlanSchema.shape.goals.element.extend({ actions: z.array(planActionSchema).max(10) });
export type PlanGoal = z.output<typeof planGoalSchema>;

/** The goals part of the items column, as data. Junk in the column reads as no goals, not a crash. */
export const planItemsSchema = z.array(planGoalSchema).catch([]);

export const storedItemsSchema = z.object({ goals: planItemsSchema, risks: z.array(z.string()).catch([]) });

export function readItems(items: unknown): { goals: PlanGoal[]; risks: string[] } {
  return storedItemsSchema.catch({ goals: [], risks: [] }).parse(items);
}

export type PlanSummary = { now: number; next: number; later: number; actionsDone: number; actionsTotal: number };

/** The per-horizon goal counts and the actions' progress. Accepts a full plan view or bare items. */
export function planSummary(plan: { items?: { goals: PlanGoal[]; risks?: string[] }; goals?: PlanGoal[] }): PlanSummary {
  const goals = plan.items ? plan.items.goals : (plan.goals ?? []);
  const summary: PlanSummary = { now: 0, next: 0, later: 0, actionsDone: 0, actionsTotal: 0 };
  for (const goal of goals) {
    summary[goal.horizon === "NOW" ? "now" : goal.horizon === "NEXT" ? "next" : "later"] += 1;
    for (const action of goal.actions) {
      summary.actionsTotal += 1;
      if (action.done) summary.actionsDone += 1;
    }
  }
  return summary;
}
