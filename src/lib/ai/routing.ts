import "server-only";

import type { AiTaskConfig } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings-data";

import { budgetExceeded } from "./budget";
import { loadAiConfig, type AiConfig } from "./config";
import { AiError } from "./errors";
import { createProvider } from "./index";
import type { AIProvider, CompletionRequest, JsonCompletionRequest, UsageReport } from "./provider";
import { logUsage } from "./usage";

// Per-task AI routing (master.md §11.2–11.3): each task can use its own
// model, temperature and limits, with the app's single provider settings
// behind every value the task doesn't set.

/** The way a task's calls are run, once its AiTaskConfig row (if any) is applied to the app's AI settings. */
export type ResolvedTaskConfig = AiConfig & {
  /** The task key, e.g. "screen-posting". */
  task: string;
  /** The saved temperature, e.g. 0.3; null follows the task's creativity. */
  temperature: number | null;
  maxTokens: number | null;
  /** How often a failed call is retried; the routing wrapper leaves the loop to callers. */
  retries: number | null;
  /** The model to try once when the primary one fails; null for none. */
  fallbackModel: string | null;
  contextLimit: number | null;
  enabled: boolean;
  /** How many of the task's calls may run at once; left to the callers. */
  maxConcurrency: number | null;
  /** The saved provider kind, e.g. "ANTHROPIC", for the Settings screen; "" follows the app-wide provider. */
  providerChoice: string;
};

/** The temperature as saved ("0.3"), or null when empty or invalid, so the task's default stands. */
function parseTemperature(saved: string): number | null {
  const value = Number(saved.trim());
  if (saved.trim() === "" || !Number.isFinite(value) || value < 0 || value > 2) return null;
  return value;
}

/** loadTaskConfig with the pieces apart: the merge itself, which needs no database. */
export function resolveTaskConfig(task: string, config: AiConfig, row: AiTaskConfig | null): ResolvedTaskConfig {
  return {
    ...config,
    // The timeout, like the model, is the task's when it has one.
    timeoutMs: row?.timeoutSeconds ? row.timeoutSeconds * 1000 : config.timeoutMs,
    model: (row?.model.trim() || config.model) || null,
    task,
    temperature: row ? parseTemperature(row.temperature) : null,
    maxTokens: row?.maxTokens ?? null,
    retries: row?.retries ?? null,
    fallbackModel: row?.fallbackModel.trim() || null,
    contextLimit: row?.contextLimit ?? null,
    enabled: row?.enabled ?? true,
    maxConcurrency: row?.maxConcurrency ?? null,
    providerChoice: row?.provider ?? "",
  };
}

/** The task's effective configuration: the app-wide AI settings with the task's own overrides on top. */
export async function loadTaskConfig(task: string): Promise<ResolvedTaskConfig> {
  const [config, row] = await Promise.all([
    loadAiConfig(),
    prisma.aiTaskConfig.findUnique({ where: { id: task } }),
  ]);
  return resolveTaskConfig(task, config, row);
}

/**
 * The provider for one task: its model override, its fallback model, and a
 * usage log for every call (master.md §11.2–11.4). A task that is switched
 * off, or that may not run under the budgets, throws here rather than at
 * first use.
 */
export async function getProviderForTask(task: string): Promise<AIProvider> {
  const config = await loadTaskConfig(task);
  if (!config.enabled) throw AiError.config("This AI task is switched off in Settings.");

  // A budget with "stop" turned on halts every task until it resets (master.md §11.4).
  const budget = await budgetExceeded();
  if (budget?.exceeded && (await loadSettings()).aiBudgetStop) {
    throw AiError.config(`The ${budget.window} AI budget is used up. Raise it in Settings, or wait for it to reset.`);
  }

  return new TaskProvider(task, config, createProvider(config));
}

/** The provider one task talks through: the fallback model and the usage log wrap every call. */
class TaskProvider implements AIProvider {
  readonly kind: AIProvider["kind"];
  readonly model: string | null;
  /** Built when first needed, so a bad fallback configuration can't stop a working primary. */
  private fallback: AIProvider | null = null;

  constructor(
    private readonly task: string,
    private readonly config: ResolvedTaskConfig,
    private readonly primary: AIProvider,
  ) {
    this.kind = primary.kind;
    this.model = config.model;
  }

  complete(request: CompletionRequest): Promise<string>;
  complete<T>(request: JsonCompletionRequest<T>): Promise<T>;
  async complete<T>(request: CompletionRequest | JsonCompletionRequest<T>): Promise<string | T> {
    // What the API reported, filled in while the call runs; a fallback's report replaces the primary's.
    let counts: UsageReport = {};
    const send = (provider: AIProvider): Promise<string | T> => {
      const common = {
        system: request.system,
        messages: request.messages,
        creativity: request.creativity,
        temperature: this.config.temperature ?? undefined,
        effort: request.effort,
        signal: request.signal,
        maxTokens: request.maxTokens,
        onUsage: (reported: UsageReport) => {
          counts = reported;
        },
      };
      return "schema" in request
        ? provider.complete({ ...common, schema: request.schema, schemaName: request.schemaName })
        : provider.complete(common);
    };
    const attempt = async (provider: AIProvider, note?: string): Promise<string | T> => {
      const started = performance.now();
      const model = provider.model ?? this.config.model ?? "";
      try {
        const data = await send(provider);
        await this.log(model, started, counts, true, note);
        return data;
      } catch (error) {
        const problem = error instanceof Error ? error.message : "The call failed.";
        await this.log(model, started, counts, false, note ? `${note} ${problem}` : problem);
        throw error;
      }
    };

    try {
      return await attempt(this.primary);
    } catch (error) {
      // One try with the fallback model, for failures that might not repeat (master.md §11.2).
      // Never silently: the fallback's entry says it ran.
      const fallbackModel = this.config.fallbackModel;
      if (!(error instanceof AiError) || !error.retryable || fallbackModel === null) throw error;
      this.fallback ??= createProvider({ ...this.config, model: fallbackModel });
      return attempt(this.fallback, `fallback:${fallbackModel}`);
    }
  }

  listModels(signal?: AbortSignal): Promise<string[]> {
    return this.primary.listModels(signal);
  }

  test(signal?: AbortSignal): Promise<{ model: string; latencyMs: number }> {
    return this.primary.test(signal);
  }

  private log(model: string, started: number, counts: UsageReport, success: boolean, error?: string): Promise<void> {
    return logUsage({
      task: this.task,
      provider: this.kind,
      model,
      ...counts,
      durationMs: performance.now() - started,
      success,
      error,
    });
  }
}
