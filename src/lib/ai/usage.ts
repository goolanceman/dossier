import "server-only";

import { prisma } from "@/lib/prisma";
import { logServerWarning } from "@/lib/log";

// Token and cost logging for every AI call (master.md §11.4). Providers that
// don't report tokens leave the counts empty: they are never guessed, so the
// sums are a floor, not an estimate.

/** One call to record in AiUsageLog. */
export type UsageEntry = {
  /** The task key, e.g. "score-posting". */
  task: string;
  /** The provider kind that ran, e.g. "OPENAI". */
  provider: string;
  /** The model that answered, e.g. "claude-sonnet-5". */
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  durationMs: number;
  success: boolean;
  /** What went wrong, for failed calls, or a note such as "fallback:<model>". */
  error?: string;
};

/** The per-task sums usageSummary() reports. */
export type TaskUsageSummary = {
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  durationMs: number;
};

/**
 * Records one call's usage. There is no cost estimate yet: no per-model price
 * table exists, and inventing one would fake the numbers (master.md §11.4),
 * so estimatedCost stays null. A log that can't be saved never fails the
 * call it measures.
 */
export async function logUsage(entry: UsageEntry): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        task: entry.task,
        provider: entry.provider,
        model: entry.model,
        inputTokens: entry.inputTokens ?? null,
        outputTokens: entry.outputTokens ?? null,
        cachedTokens: entry.cachedTokens ?? null,
        estimatedCost: null,
        durationMs: Math.max(0, Math.round(entry.durationMs)),
        success: entry.success,
        error: entry.error ?? "",
      },
    });
  } catch (error) {
    logServerWarning("AI usage", error instanceof Error ? error.message : "couldn't save the usage log");
  }
}

/** The calls, failures, tokens and time per task since `since`, tasks with no calls left out. */
export async function usageSummary(since: Date): Promise<Record<string, TaskUsageSummary>> {
  const [all, failed] = await Promise.all([
    prisma.aiUsageLog.groupBy({
      by: ["task"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, cachedTokens: true, durationMs: true },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["task"],
      where: { createdAt: { gte: since }, success: false },
      _count: { _all: true },
    }),
  ]);
  const failures = new Map(failed.map((row) => [row.task, row._count._all]));
  const summary: Record<string, TaskUsageSummary> = {};
  for (const row of all) {
    summary[row.task] = {
      calls: row._count._all,
      failures: failures.get(row.task) ?? 0,
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      cachedTokens: row._sum.cachedTokens ?? 0,
      durationMs: row._sum.durationMs ?? 0,
    };
  }
  return summary;
}
