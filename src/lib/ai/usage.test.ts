import { beforeEach, describe, expect, it, vi } from "vitest";

// Usage-log tests (master.md §11.4) with the database scripted: what goes in,
// what comes out, and that a failed log never fails the call it measured.

type Group = { task: string; _count: { _all: number }; _sum: { inputTokens: number | null; outputTokens: number | null; cachedTokens: number | null; durationMs: number | null } };

const db = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  groups: [] as Group[],
  failedGroups: [] as { task: string; _count: { _all: number } }[],
  failCreate: false,
}));

vi.mock("@/lib/prisma", async () => ({
  prisma: {
    aiUsageLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (db.failCreate) throw new Error("database is gone");
        db.created.push(data);
        return data;
      },
      groupBy: async ({ where }: { where: { success?: boolean } }) => (where.success === false ? db.failedGroups : db.groups),
    },
  },
}));
vi.mock("@/lib/log", () => ({ logServerWarning: vi.fn() }));

import { logUsage, usageSummary } from "./usage";

beforeEach(() => {
  db.created = [];
  db.groups = [];
  db.failedGroups = [];
  db.failCreate = false;
});

describe("logUsage", () => {
  it("writes the entry, with missing counts and errors as empty", async () => {
    await logUsage({ task: "score-posting", provider: "OPENAI", model: "gpt", durationMs: 1_234.6, success: true });
    expect(db.created).toEqual([
      {
        task: "score-posting",
        provider: "OPENAI",
        model: "gpt",
        inputTokens: null,
        outputTokens: null,
        cachedTokens: null,
        // No per-model prices exist, so there is no estimate: null, never invented.
        estimatedCost: null,
        durationMs: 1_235,
        success: true,
        error: "",
      },
    ]);
  });

  it("writes the counts and the error it was given", async () => {
    await logUsage({ task: "screen-posting", provider: "MOCK", model: "m", inputTokens: 3, outputTokens: 0, cachedTokens: 2, durationMs: 0, success: false, error: "fallback:spare" });
    expect(db.created[0]).toMatchObject({ inputTokens: 3, outputTokens: 0, cachedTokens: 2, success: false, error: "fallback:spare" });
  });

  it("never fails the call it measures", async () => {
    db.failCreate = true;
    await expect(logUsage({ task: "t", provider: "MOCK", model: "m", durationMs: 1, success: true })).resolves.toBeUndefined();
  });
});

describe("usageSummary", () => {
  it("sums the calls, failures, tokens and time per task", async () => {
    db.groups = [
      {
        task: "score-posting",
        _count: { _all: 3 },
        _sum: { inputTokens: 100, outputTokens: 50, cachedTokens: null, durationMs: 900 },
      },
      { task: "assess-job", _count: { _all: 1 }, _sum: { inputTokens: null, outputTokens: null, cachedTokens: null, durationMs: null } },
    ];
    db.failedGroups = [{ task: "score-posting", _count: { _all: 1 } }];

    const summary = await usageSummary(new Date("2026-11-01T00:00:00Z"));
    expect(summary["score-posting"]).toEqual({ calls: 3, failures: 1, inputTokens: 100, outputTokens: 50, cachedTokens: 0, durationMs: 900 });
    // Providers that reported nothing count as zeros, never as guesses.
    expect(summary["assess-job"]).toEqual({ calls: 1, failures: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, durationMs: 0 });
    expect(summary["never-ran"]).toBeUndefined();
  });
});
