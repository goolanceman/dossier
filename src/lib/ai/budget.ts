import "server-only";

import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings-data";

// Spending budgets for AI calls (master.md §11.4), read from the
// aiBudgetDailyCents / aiBudgetMonthlyCents / aiBudgetStop settings.

/** The state of the budgets: which window tripped, if either did, and its figures in cents. */
export type BudgetStatus = {
  exceeded: boolean;
  /** Which window's budget applies; "none" while nothing has tripped. */
  window: "daily" | "monthly" | "none";
  spentCents: number;
  budgetCents: number;
};

/**
 * Whether an AI spending budget is over, or null when no budget is set.
 *
 * The cost basis is the sum of AiUsageLog.estimatedCost over the window.
 * Nothing estimates that cost today: logUsage() writes null while no
 * per-model price table exists, and prices must never be invented
 * (master.md §11.4), so until one is configured the spend always reads as
 * 0 and no budget can trip. The figures below are therefore a floor: with
 * providers that report no cost, a budget cannot be evaluated, only stand
 * ready for when one can be.
 *
 * A window is over when its spend has reached its budget: there is no room
 * left for the next call. The day and month run in UTC.
 */
export async function budgetExceeded(): Promise<BudgetStatus | null> {
  const { aiBudgetDailyCents: daily, aiBudgetMonthlyCents: monthly } = await loadSettings();
  if (daily === null && monthly === null) return null;

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const spent = async (since: Date): Promise<number> => {
    const { _sum } = await prisma.aiUsageLog.aggregate({
      _sum: { estimatedCost: true },
      where: { createdAt: { gte: since } },
    });
    // Null everywhere means no cost was measurable: nothing to count, never a guess.
    return _sum.estimatedCost ?? 0;
  };
  const [spentToday, spentThisMonth] = await Promise.all([spent(dayStart), spent(monthStart)]);

  if (daily !== null && spentToday >= daily) return { exceeded: true, window: "daily", spentCents: spentToday, budgetCents: daily };
  if (monthly !== null && spentThisMonth >= monthly) {
    return { exceeded: true, window: "monthly", spentCents: spentThisMonth, budgetCents: monthly };
  }
  // Not over: report the daily window when there is one, else the monthly.
  return daily !== null
    ? { exceeded: false, window: "none", spentCents: spentToday, budgetCents: daily }
    : { exceeded: false, window: "none", spentCents: spentThisMonth, budgetCents: monthly! };
}
