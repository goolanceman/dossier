import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiProvider } from "@/generated/prisma/enums";
import type { AiTaskConfig } from "@/generated/prisma/client";

import type { AiConfig } from "./config";
import type { AIProvider, ChatCall } from "./provider";
import { MockProvider } from "./providers/mock";

// Routing tests (master.md §11.2–11.3) with the database and the providers
// scripted: resolution, overrides, the disabled switch, the fallback and the
// usage entries every call leaves behind.

const db = vi.hoisted(() => ({
  taskRow: null as AiTaskConfig | null,
  settings: [] as { key: string; value: string }[],
  usageLogs: [] as Record<string, unknown>[],
  /** The estimatedCost the usage log reports for the windows, null when unmeasured. */
  spent: null as number | null,
}));

vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/prisma", async () => ({
  prisma: {
    setting: { findMany: async () => db.settings },
    aiTaskConfig: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === "test-task" ? db.taskRow : null),
    },
    aiUsage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.usageLogs.push(data);
        return data;
      },
      aggregate: async () => ({ _sum: { estimatedCost: db.spent } }),
      groupBy: async () => [],
    },
  },
}));

// createProvider is scripted by model, so tests wire MockProviders in as the
// primary and the fallback instead of reaching any server.
const scripted = vi.hoisted(() => ({ byModel: new Map<string, AIProvider>() }));
vi.mock("./index", async () => {
  const { AiError } = await import("./errors");
  return {
    createProvider: (config: AiConfig) => {
      const provider = config.model ? scripted.byModel.get(config.model) : undefined;
      if (!provider) throw new AiError("config", `No scripted provider for "${config.model ?? ""}".`);
      return provider;
    },
  };
});

import { getProviderForTask, loadTaskConfig, resolveTaskConfig } from "./routing";

const config: AiConfig = {
  provider: AiProvider.OPENAI,
  baseUrl: "https://api.example.com/v1",
  model: "app-model",
  apiKey: null,
  apiKeyProblem: null,
  timeoutMs: 60_000,
};

const row = (overrides: Partial<AiTaskConfig> = {}): AiTaskConfig => ({
  id: "test-task",
  provider: "",
  model: "",
  temperature: "",
  maxTokens: null,
  timeoutSeconds: null,
  retries: null,
  fallbackModel: "",
  contextLimit: null,
  enabled: true,
  maxConcurrency: 3,
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  db.taskRow = null;
  db.settings = [];
  db.usageLogs = [];
  db.spent = null;
  scripted.byModel.clear();
});

describe("resolveTaskConfig", () => {
  it("follows the app-wide config when there is no row", () => {
    const resolved = resolveTaskConfig("test-task", config, null);
    expect(resolved).toMatchObject({ model: "app-model", timeoutMs: 60_000, temperature: null, enabled: true, providerChoice: "", task: "test-task" });
    expect(resolved.fallbackModel).toBeNull();
    expect(resolved.maxTokens).toBeNull();
  });

  it("applies the row's overrides, the timeout in seconds as milliseconds", () => {
    const resolved = resolveTaskConfig(
      "test-task",
      config,
      row({ model: "task-model", temperature: "0.3", maxTokens: 2048, timeoutSeconds: 45, retries: 2, fallbackModel: "spare-model", contextLimit: 32_000, maxConcurrency: 1, provider: "ANTHROPIC" }),
    );
    expect(resolved).toMatchObject({
      model: "task-model",
      temperature: 0.3,
      maxTokens: 2048,
      timeoutMs: 45_000,
      retries: 2,
      fallbackModel: "spare-model",
      contextLimit: 32_000,
      maxConcurrency: 1,
      providerChoice: "ANTHROPIC",
    });
  });

  it('reads empty fields as "follow the app"', () => {
    const resolved = resolveTaskConfig("test-task", config, row({ model: "  ", temperature: "  ", fallbackModel: "" }));
    expect(resolved.model).toBe("app-model");
    expect(resolved.temperature).toBeNull();
    expect(resolved.fallbackModel).toBeNull();
  });

  it('reads an invalid temperature as "follow the task default", and a plain one as a number', () => {
    expect(resolveTaskConfig("test-task", config, row({ temperature: "chatty" })).temperature).toBeNull();
    expect(resolveTaskConfig("test-task", config, row({ temperature: "1.0" })).temperature).toBe(1);
  });

  it("keeps a switched-off task switched off", () => {
    expect(resolveTaskConfig("test-task", config, row({ enabled: false })).enabled).toBe(false);
  });
});

describe("loadTaskConfig", () => {
  it("merges the saved row over the app-wide settings", async () => {
    db.settings = [
      { key: "provider", value: "OPENAI" },
      { key: "model", value: "app-model" },
    ];
    expect(await loadTaskConfig("test-task")).toMatchObject({ model: "app-model", enabled: true, temperature: null });

    db.taskRow = row({ model: "task-model", temperature: "0.8", enabled: true });
    expect(await loadTaskConfig("test-task")).toMatchObject({ model: "task-model", temperature: 0.8 });
  });
});

describe("getProviderForTask", () => {
  it("refuses a task that is switched off", async () => {
    db.taskRow = row({ enabled: false });
    await expect(getProviderForTask("test-task")).rejects.toMatchObject({
      kind: "config",
      message: "This AI task is switched off in Settings.",
    });
  });

  it("logs the tokens a successful call reported, against the task's model", async () => {
    db.taskRow = row({ model: "task-model" });
    scripted.byModel.set("task-model", new MockProvider({ model: "task-model", reply: (call: ChatCall) => { call.onUsage?.({ inputTokens: 10, outputTokens: 5, cachedTokens: 4 }); return "done"; } }));
    const provider = await getProviderForTask("test-task");
    await expect(provider.complete({ task: "assess-job", system: "s", messages: [{ role: "user", content: "hi" }] })).resolves.toBe("done");
    expect(db.usageLogs).toHaveLength(1);
    expect(db.usageLogs[0]).toMatchObject({
      task: "test-task",
      provider: "MOCK",
      model: "task-model",
      inputTokens: 10,
      outputTokens: 5,
      cachedTokens: 4,
      success: true,
      error: "",
    });
  });

  it("sends the task's temperature instead of the creativity's", async () => {
    db.taskRow = row({ model: "task-model", temperature: "0.3" });
    const mock = new MockProvider({ model: "task-model", reply: () => "done" });
    scripted.byModel.set("task-model", mock);
    const provider = await getProviderForTask("test-task");
    await provider.complete({ task: "assess-job", system: "s", messages: [{ role: "user", content: "hi" }], creativity: "FAITHFUL" });
    expect(mock.calls[0].temperature).toBe(0.3);
  });

  it("keeps the creativity's temperature when the task has none", async () => {
    db.taskRow = row({ model: "task-model" });
    const mock = new MockProvider({ model: "task-model", reply: () => "done" });
    scripted.byModel.set("task-model", mock);
    const provider = await getProviderForTask("test-task");
    await provider.complete({ task: "assess-job", system: "s", messages: [{ role: "user", content: "hi" }], creativity: "FAITHFUL" });
    expect(mock.calls[0].temperature).toBe(0.2);
  });

  it("retries once with the fallback model and never silently", async () => {
    db.taskRow = row({ model: "task-model", fallbackModel: "spare-model" });
    const primary = new MockProvider({ model: "task-model", reply: () => Promise.reject(new Error("boom")) });
    const spare = new MockProvider({ model: "spare-model", reply: (call: ChatCall) => { call.onUsage?.({ inputTokens: 8, outputTokens: 3 }); return "saved"; } });
    scripted.byModel.set("task-model", primary);
    scripted.byModel.set("spare-model", spare);

    const provider = await getProviderForTask("test-task");
    await expect(provider.complete({ task: "assess-job", system: "s", messages: [{ role: "user", content: "hi" }] })).resolves.toBe("saved");
    expect(primary.calls).toHaveLength(1);
    expect(spare.calls).toHaveLength(1);
    // Both calls are on the log: the failure, and the fallback that ran (master.md §11.2).
    expect(db.usageLogs).toHaveLength(2);
    expect(db.usageLogs[0]).toMatchObject({ model: "task-model", success: false });
    expect(db.usageLogs[0].error).toContain("ran into a problem");
    expect(db.usageLogs[1]).toMatchObject({ model: "spare-model", success: true, error: "fallback:spare-model", inputTokens: 8, outputTokens: 3 });
  });

  it("lets a failed call through when there is no fallback model, and logs the failure", async () => {
    db.taskRow = row({ model: "task-model" });
    scripted.byModel.set("task-model", new MockProvider({ model: "task-model", reply: () => Promise.reject(new Error("boom")) }));

    const provider = await getProviderForTask("test-task");
    await expect(provider.complete({ task: "assess-job", system: "s", messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ kind: "provider" });
    expect(db.usageLogs).toHaveLength(1);
    expect(db.usageLogs[0]).toMatchObject({ model: "task-model", success: false });
    expect(db.usageLogs[0].error).toContain("ran into a problem");
  });

  it("stops every task while a budget is over and stopping is on", async () => {
    db.taskRow = row({ model: "task-model" });
    db.settings = [
      { key: "aiBudgetDailyCents", value: "5" },
      { key: "aiBudgetStop", value: "true" },
    ];
    db.spent = 10;
    await expect(getProviderForTask("test-task")).rejects.toMatchObject({ kind: "config", message: expect.stringContaining("daily AI budget") });
  });

  it("runs anyway while a budget is over but stopping is off", async () => {
    db.taskRow = row({ model: "task-model" });
    db.settings = [{ key: "aiBudgetDailyCents", value: "5" }];
    db.spent = 10;
    scripted.byModel.set("task-model", new MockProvider({ model: "task-model", reply: () => "done" }));
    const provider = await getProviderForTask("test-task");
    await expect(provider.complete({ task: "assess-job", system: "s", messages: [{ role: "user", content: "hi" }] })).resolves.toBe("done");
  });
});
