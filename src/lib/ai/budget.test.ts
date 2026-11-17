import { beforeEach, describe, expect, it, vi } from "vitest";

// Budget tests (master.md §11.4) with the database scripted: no budget is
// null, a budget over is reported, and unmeasured cost is never invented.

const db = vi.hoisted(() => ({
  settings: [] as { key: string; value: string }[],
  /**
   * The estimatedCost sums the log reports, one per aggregate() call: the
   * daily window first, then the monthly one (both are always summed when
   * any budget is set).
   */
  spents: [] as (number | null)[],
}));

vi.mock("@/lib/prisma", async () => ({
  prisma: {
    setting: { findMany: async () => db.settings },
    aiUsage: {
      aggregate: async () => ({ _sum: { estimatedCost: db.spents.shift() ?? null } }),
    },
  },
}));

import { budgetExceeded } from "./budget";

beforeEach(() => {
  db.settings = [];
  db.spents = [];
});

describe("budgetExceeded", () => {
  it("is null when no budget is set", async () => {
    expect(await budgetExceeded()).toBeNull();
  });

  it("reports the daily budget, untripped while the spend is under it", async () => {
    db.settings = [{ key: "aiBudgetDailyCents", value: "50" }];
    db.spents = [49, 49];
    expect(await budgetExceeded()).toEqual({ exceeded: false, window: "none", spentCents: 49, budgetCents: 50 });
  });

  it("reports the daily window once its spend reaches the budget", async () => {
    db.settings = [{ key: "aiBudgetDailyCents", value: "50" }];
    db.spents = [51, 0];
    expect(await budgetExceeded()).toEqual({ exceeded: true, window: "daily", spentCents: 51, budgetCents: 50 });
  });

  it("reports the monthly window when only it is over", async () => {
    db.settings = [
      { key: "aiBudgetDailyCents", value: "100" },
      { key: "aiBudgetMonthlyCents", value: "200" },
    ];
    db.spents = [50, 250];
    expect(await budgetExceeded()).toEqual({ exceeded: true, window: "monthly", spentCents: 250, budgetCents: 200 });
  });

  it("counts unmeasured cost as nothing, never as an estimate", async () => {
    db.settings = [{ key: "aiBudgetDailyCents", value: "1" }];
    // estimatedCost is null in every row: no prices, nothing measurable, no trip.
    expect(await budgetExceeded()).toEqual({ exceeded: false, window: "none", spentCents: 0, budgetCents: 1 });
  });

  it("reports the monthly figures when only a monthly budget is set", async () => {
    db.settings = [{ key: "aiBudgetMonthlyCents", value: "500" }];
    db.spents = [10, 10];
    expect(await budgetExceeded()).toEqual({ exceeded: false, window: "none", spentCents: 10, budgetCents: 500 });
  });
});
