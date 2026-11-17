import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { createTarget } from "./targets";
import { createCareerPlan, deleteCareerPlan, getCareerPlan, listCareerPlans, planSummary, setActionDone } from "./plan";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

// The career_plan contract's goal shape (task-contracts), as a task answer would bring it.
const goal = (id: string, horizon: "NOW" | "NEXT" | "LATER", actions: { id: string; action: string; effort: "LIGHT" | "MEDIUM" | "HEAVY" }[] = []) => ({
  id,
  title: `Goal ${id}`,
  horizon,
  why: `Why ${id}`,
  actions: actions.map((action) => ({ ...action, evidenceIds: [] })),
  milestones: [`Milestone for ${id}`],
});

describe("career plans", () => {
  it("stores the goals and risks under the contract shape, and reads them back", async () => {
    const plan = await createCareerPlan({
      basedOn: "PROFILE",
      headline: "From backend to staff engineer",
      summary: "The plan, in a line.",
      goals: [goal("G1", "NOW", [{ id: "A1", action: "Ship a design doc", effort: "LIGHT" }])],
      risks: ["Spreading across too many targets at once."],
      planWith: "career-plan@1",
    });
    expect(plan).toMatchObject({
      basedOn: "PROFILE",
      headline: "From backend to staff engineer",
      planWith: "career-plan@1",
      target: null,
      critiqueId: null,
      items: { risks: ["Spreading across too many targets at once."], goals: [{ id: "G1", horizon: "NOW" }] },
    });
    // The column itself keeps the contract's markers beside the goals.
    const stored = await prisma().careerPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(stored.items).toMatchObject({ schema_version: "1.0", task: "career_plan", goals: [{ id: "G1" }] });
    // The action has no done flag until the user checks it.
    expect(plan.items.goals[0]?.actions[0]).toMatchObject({ id: "A1" });
    expect(plan.items.goals[0]?.actions[0]?.done).toBeUndefined();
  });

  it("lists newest first with the target's title when one is linked", async () => {
    const target = await createTarget({ title: "Staff Backend Engineer" });
    const first = await createCareerPlan({ basedOn: "PROFILE", goals: [goal("G1", "NOW")], planWith: "career-plan@1" });
    const second = await createCareerPlan({ basedOn: "RESUME", goals: [], targetId: target.id, planWith: "career-plan@1" });
    const plans = await listCareerPlans();
    expect(plans.map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(plans[0]).toMatchObject({ target: { title: "Staff Backend Engineer" } });
    expect(plans[1]).toMatchObject({ target: null });
    expect(await getCareerPlan(first.id)).toMatchObject({ id: first.id, basedOn: "PROFILE" });
  });

  it("rejects goals that break the contract", async () => {
    await expect(
      // "SOMEDAY" is not a horizon the contract knows.
      createCareerPlan({ basedOn: "PROFILE", goals: [goal("G1", "SOMEDAY" as "NOW")], planWith: "career-plan@1" }),
    ).rejects.toThrow();
    await expect(
      // Actions cap at 10 per goal (the contract's own max).
      createCareerPlan({
        basedOn: "PROFILE",
        goals: [goal("G1", "NOW", Array.from({ length: 11 }, (_, index) => ({ id: `A${index}`, action: "Do it", effort: "LIGHT" as const })))],
        planWith: "career-plan@1",
      }),
    ).rejects.toThrow();
  });

  it("checks an action, keeps it checked, and reads it back", async () => {
    const plan = await createCareerPlan({ basedOn: "PROFILE", goals: [goal("G1", "NOW", [{ id: "A1", action: "Ship a design doc", effort: "LIGHT" }])], planWith: "career-plan@1" });

    const checked = await setActionDone(plan.id, "A1", true);
    expect(checked?.items.goals[0]?.actions[0]).toMatchObject({ id: "A1", done: true });
    // It survives a fresh read from the database.
    expect((await getCareerPlan(plan.id))?.items.goals[0]?.actions[0]).toMatchObject({ done: true });

    // Unchecking goes through the same path.
    expect((await setActionDone(plan.id, "A1", false))?.items.goals[0]?.actions[0]).toMatchObject({ done: false });

    // An id no goal has changes nothing; a plan that is gone returns null.
    expect((await setActionDone(plan.id, "no-such-action", true))?.items.goals[0]?.actions[0]).toMatchObject({ done: false });
    expect(await setActionDone("no-such-plan", "A1", true)).toBeNull();
  });

  it("reads a plan whose items column holds junk as an empty plan", async () => {
    const row = await prisma().careerPlan.create({ data: { items: { junk: true } } });
    const plan = await getCareerPlan(row.id);
    expect(plan).toMatchObject({ items: { goals: [], risks: [] } });
    // There is no action to check in it, so the toggle changes nothing.
    const saved = await setActionDone(row.id, "A1", true);
    expect(saved).toMatchObject({ items: { goals: [], risks: [] } });
  });

  it("counts goals per horizon and actions done for the list rows", async () => {
    const plan = await createCareerPlan({
      basedOn: "PROFILE",
      goals: [
        goal("G1", "NOW", [
          { id: "A1", action: "One", effort: "LIGHT" },
          { id: "A2", action: "Two", effort: "MEDIUM" },
        ]),
        goal("G2", "LATER", [{ id: "A3", action: "Three", effort: "HEAVY" }]),
      ],
      planWith: "career-plan@1",
    });
    await setActionDone(plan.id, "A1", true);
    const saved = (await getCareerPlan(plan.id))!;
    expect(planSummary(saved)).toEqual({ now: 1, next: 0, later: 1, actionsDone: 1, actionsTotal: 3 });
    expect(planSummary({ items: { goals: [], risks: [] } })).toEqual({ now: 0, next: 0, later: 0, actionsDone: 0, actionsTotal: 0 });
  });

  it("deletes for good", async () => {
    const plan = await createCareerPlan({ basedOn: "PROFILE", goals: [goal("G1", "NOW")], planWith: "career-plan@1" });
    await deleteCareerPlan(plan.id);
    expect(await getCareerPlan(plan.id)).toBeNull();
    expect(await prisma().careerPlan.count()).toBe(0);
  });
});
