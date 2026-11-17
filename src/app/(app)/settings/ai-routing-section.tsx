"use client";

import { useState } from "react";

import { useTrackSave } from "@/components/save-tracker";
import { toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { PROVIDER_OPTIONS } from "@/lib/ai/provider-options";

import { saveBudgets, saveTaskRouting, setTaskEnabled } from "./actions";
import { SettingsSectionIntro } from "./settings-screen";
import type { TaskKey } from "./sections";

export type TaskRoutingRow = {
  task: TaskKey;
  label: string;
  description: string;
  enabled: boolean;
  /** The saved provider kind, or "" for the app's provider. */
  providerChoice: string;
  /** The provider that would run, resolved. */
  providerName: string;
  /** The saved model override, or "" to follow the app default. */
  savedModel: string;
  /** The model that would run, resolved. */
  resolvedModel: string;
  temperature: string;
  maxTokens: number | null;
  timeoutSeconds: number | null;
  retries: number | null;
  fallbackModel: string;
  contextLimit: number | null;
  maxConcurrency: number | null;
};

/** The app-wide provider and model every row falls back to. */
export type AppDefault = { providerName: string; model: string };

export type TaskUsageRow = {
  task: string;
  label: string;
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** Whether the provider reported any input tokens: where it didn't, they're never shown as 0. */
  reportsTokens: boolean;
};

export type UsageView = {
  tasks: TaskUsageRow[];
  /** Whether any call in the window carried a cost estimate. */
  anyCost: boolean;
  totalCostCents: number;
};

export type BudgetsView = {
  dailyCents: number | null;
  monthlyCents: number | null;
  stop: boolean;
  status: { exceeded: boolean; window: "daily" | "monthly" | "none"; spentCents: number; budgetCents: number } | null;
};

const number = (value: number) => value.toLocaleString("en-US");
const clock = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);
/** A field's text as a number, or null while it's blank (follow the default); the action's schema rejects the rest. */
const asNumber = (value: string) => (value.trim() === "" ? null : Number(value));
const providerNameOf = (choice: string) => PROVIDER_OPTIONS.find((option) => option.value === choice)?.name ?? choice;
/** The provider kinds the save action takes; the select's value is checked there. */
type ProviderChoice = "" | (typeof PROVIDER_OPTIONS)[number]["value"];

/**
 * Settings → AI models & usage (master.md §11.3–11.4): one routing row per AI
 * task, the 30-day usage, and the spending budgets. Budgets only count what
 * providers report as cost, so they can't trip while nothing reports one.
 */
export function AiRoutingSection({ rows: initialRows, appDefault, usage, budgets: initialBudgets }: {
  rows: TaskRoutingRow[];
  appDefault: AppDefault;
  usage: UsageView;
  budgets: BudgetsView;
}) {
  const track = useTrackSave();
  const [rows, setRows] = useState(initialRows);
  const [budgets, setBudgets] = useState(initialBudgets);
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (task: TaskKey, enabled: boolean) => {
    setRows((current) => current.map((row) => (row.task === task ? { ...row, enabled } : row)));
    void track(setTaskEnabled({ task, enabled })).then((result) => {
      if (!toastResult(result).ok) setRows((current) => current.map((row) => (row.task === task ? { ...row, enabled: !enabled } : row)));
    });
  };

  const saved = (next: TaskRoutingRow) => {
    setRows((current) => current.map((row) => (row.task === next.task ? next : row)));
    setOpen(null);
  };

  return (
    <>
      <SettingsSectionIntro title="AI models & usage">
        Every AI task can run on its own provider and model, with the app provider in Settings → AI provider behind everything a task doesn&apos;t set. Usage and
        budgets count only what providers report; Dossier never estimates a number.
      </SettingsSectionIntro>

      <Card padding="none" className="px-7 py-2">
        {rows.map((row) => (
          <div key={row.task} className="flex flex-col gap-3 border-b border-line-card py-5 last:border-b-0">
            <div className="flex items-start justify-between gap-5">
              <Toggle
                className="min-w-0 flex-1"
                label={row.label}
                description={row.description}
                checked={row.enabled}
                onCheckedChange={(enabled) => toggle(row.task, enabled)}
              />
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={open === row.task}
                aria-controls={`routing-${row.task}`}
                aria-label={`${open === row.task ? "Close" : "Edit"} routing for ${row.label}`}
                onClick={() => setOpen(open === row.task ? null : row.task)}
              >
                {open === row.task ? "Close" : "Edit"}
              </Button>
            </div>
            <p className="text-meta text-muted">
              {row.enabled
                ? `Runs on ${row.providerName}${row.resolvedModel.trim() === "" ? "" : ` with ${row.resolvedModel}`}.`
                : "Switched off. Tasks that run through it fail until it's on."}
            </p>
            {open === row.task && <RoutingForm id={`routing-${row.task}`} row={row} appDefault={appDefault} onSaved={saved} />}
          </div>
        ))}
      </Card>

      {rows.some((row) => row.fallbackModel.trim() !== "") && (
        <p className="text-meta text-muted">
          A task with a fallback model tries it once when the primary model fails. The switch is never silent: the call&apos;s usage entry names the fallback model
          it ran on.
        </p>
      )}

      <Card padding="none" className="flex flex-col gap-4 px-7 py-[26px]">
        <div className="flex flex-col gap-1">
          <h3 className="text-field font-medium">Usage, last 30 days</h3>
          <p className="text-meta text-muted">Per task, from every call&apos;s usage log.</p>
        </div>
        {usage.tasks.length === 0 ? (
          <p className="text-meta text-muted">No AI calls in the last 30 days.</p>
        ) : (
          <table className="w-full max-w-3xl text-left text-meta">
            <thead>
              <tr className="border-b border-line-card text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">Task</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Calls</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Failed</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Input tokens</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Output tokens</th>
                <th scope="col" className="py-2 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {usage.tasks.map((row) => (
                <tr key={row.task} className="border-b border-line-card last:border-b-0">
                  <th scope="row" className="py-2 pr-4 font-normal">{row.label}</th>
                  <td className="py-2 pr-4 text-right tabular-nums">{number(row.calls)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{number(row.failures)}</td>
                  {row.reportsTokens ? (
                    <>
                      <td className="py-2 pr-4 text-right tabular-nums">{number(row.inputTokens)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{number(row.outputTokens)}</td>
                    </>
                  ) : (
                    <td colSpan={2} className="py-2 pr-4 text-right text-muted">Not reported by this provider</td>
                  )}
                  <td className="py-2 text-right tabular-nums">{clock(row.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-meta text-muted">
          {usage.anyCost
            ? `Estimated cost so far: ${number(usage.totalCostCents)} cents, from the prices the providers reported.`
            : "No provider has reported a cost yet, so the totals stay empty. Token counts are only what providers report: Dossier never estimates them."}
        </p>
      </Card>

      <BudgetsCard budgets={budgets} onSaved={(next) => setBudgets(next)} />
    </>
  );
}

/** The routing form for one task: blank means "follow the app default". */
function RoutingForm({ id, row, appDefault, onSaved }: {
  id: string;
  row: TaskRoutingRow;
  appDefault: AppDefault;
  onSaved: (row: TaskRoutingRow) => void;
}) {
  const track = useTrackSave();
  const [values, setValues] = useState({
    provider: row.providerChoice,
    model: row.savedModel,
    temperature: row.temperature,
    maxTokens: row.maxTokens === null ? "" : String(row.maxTokens),
    timeoutSeconds: row.timeoutSeconds === null ? "" : String(row.timeoutSeconds),
    retries: row.retries === null ? "" : String(row.retries),
    fallbackModel: row.fallbackModel,
    contextLimit: row.contextLimit === null ? "" : String(row.contextLimit),
    maxConcurrency: row.maxConcurrency === null ? "" : String(row.maxConcurrency),
  });
  const change = (next: Partial<typeof values>) => setValues({ ...values, ...next });

  const save = async () => {
    const result = await track(
      saveTaskRouting({
        task: row.task,
        provider: values.provider as ProviderChoice,
        model: values.model,
        temperature: values.temperature,
        maxTokens: asNumber(values.maxTokens),
        timeoutSeconds: asNumber(values.timeoutSeconds),
        retries: asNumber(values.retries),
        fallbackModel: values.fallbackModel,
        contextLimit: asNumber(values.contextLimit),
        maxConcurrency: asNumber(values.maxConcurrency),
      }),
    );
    if (toastResult(result).ok)
      onSaved({
        ...row,
        providerChoice: values.provider,
        providerName: values.provider === "" ? appDefault.providerName : providerNameOf(values.provider),
        savedModel: values.model,
        resolvedModel: values.model.trim() || appDefault.model,
        temperature: values.temperature.trim(),
        maxTokens: asNumber(values.maxTokens),
        timeoutSeconds: asNumber(values.timeoutSeconds),
        retries: asNumber(values.retries),
        fallbackModel: values.fallbackModel.trim(),
        contextLimit: asNumber(values.contextLimit),
        maxConcurrency: asNumber(values.maxConcurrency) ?? 3,
      });
  };

  return (
    <div id={id} className="flex flex-col gap-4 rounded-card bg-track p-4">
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        <Select label="Provider" value={values.provider} onChange={(event) => change({ provider: event.target.value })}>
          <option value="">Follow the app default ({appDefault.providerName})</option>
          {PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.name}
            </option>
          ))}
        </Select>
        <Input label="Model" value={values.model} onChange={(event) => change({ model: event.target.value })} hint="Blank follows the app default." />
        <Input
          label="Temperature"
          inputMode="decimal"
          value={values.temperature}
          onChange={(event) => change({ temperature: event.target.value })}
          hint="0 to 2, as a decimal. Blank follows the task's default."
        />
        <Input
          label="Max tokens"
          inputMode="numeric"
          value={values.maxTokens}
          onChange={(event) => change({ maxTokens: event.target.value })}
          hint="The longest answer the task may write. Blank for no cap."
        />
        <Input
          label="Timeout (seconds)"
          inputMode="numeric"
          value={values.timeoutSeconds}
          onChange={(event) => change({ timeoutSeconds: event.target.value })}
          hint="Blank follows the app default."
        />
        <Input
          label="Retries"
          inputMode="numeric"
          value={values.retries}
          onChange={(event) => change({ retries: event.target.value })}
          hint="How often a failed call is retried. Blank for none."
        />
        <Input
          label="Fallback model"
          value={values.fallbackModel}
          onChange={(event) => change({ fallbackModel: event.target.value })}
          hint="Tried once when the primary model fails. Blank for none."
        />
        <Input
          label="Context limit"
          inputMode="numeric"
          value={values.contextLimit}
          onChange={(event) => change({ contextLimit: event.target.value })}
          hint="The most input tokens the task may be given. Blank for no limit."
        />
        <Input
          label="Max calls at once"
          inputMode="numeric"
          value={values.maxConcurrency}
          onChange={(event) => change({ maxConcurrency: event.target.value })}
          hint="How many of the task's calls may run at once. Blank for 3, the default."
        />
      </div>
      <div>
        <Button onClick={() => void save()}>Save routing</Button>
      </div>
    </div>
  );
}

/** The spending budgets (master.md §11.4), in cents, with the spend they can see. */
function BudgetsCard({ budgets, onSaved }: { budgets: BudgetsView; onSaved: (budgets: BudgetsView) => void }) {
  const track = useTrackSave();
  const [values, setValues] = useState({
    dailyCents: budgets.dailyCents === null ? "" : String(budgets.dailyCents),
    monthlyCents: budgets.monthlyCents === null ? "" : String(budgets.monthlyCents),
    stop: budgets.stop,
  });
  const change = (next: Partial<typeof values>) => setValues({ ...values, ...next });

  const save = async () => {
    const applied = toastResult(await track(saveBudgets({ dailyCents: asNumber(values.dailyCents), monthlyCents: asNumber(values.monthlyCents), stop: values.stop })));
    if (applied.ok)
      onSaved({
        dailyCents: asNumber(values.dailyCents),
        monthlyCents: asNumber(values.monthlyCents),
        stop: values.stop,
        status: applied.data.status,
      });
  };

  const statusText = (() => {
    if (budgets.status === null) return "No budget set: nothing stops the AI tasks.";
    const used = `${number(budgets.status.spentCents)} of ${number(budgets.status.budgetCents)} cents`;
    if (budgets.status.exceeded) return `The ${budgets.status.window} budget is used up: ${used}. AI tasks stop until it resets.`;
    return `Used so far: ${used}.`;
  })();

  return (
    <Card padding="none" className="flex flex-col gap-5 px-7 py-[26px]">
      <div className="flex flex-col gap-1">
        <h3 className="text-field font-medium">Spending budgets</h3>
        <p className="text-meta text-muted">
          In cents, per window. They only count what providers report as cost, so with no reported cost nothing can trip them; nothing is estimated.
        </p>
      </div>
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        <Input
          label="Daily budget (cents)"
          inputMode="numeric"
          value={values.dailyCents}
          onChange={(event) => change({ dailyCents: event.target.value })}
          hint="Blank for no limit."
        />
        <Input
          label="Monthly budget (cents)"
          inputMode="numeric"
          value={values.monthlyCents}
          onChange={(event) => change({ monthlyCents: event.target.value })}
          hint="Blank for no limit."
        />
      </div>
      <Toggle
        label="Stop all AI tasks when a budget is exceeded"
        description={values.stop ? "On. Tasks fail until the window resets." : "Off. Spending is recorded, but tasks keep running."}
        checked={values.stop}
        onCheckedChange={(stop) => change({ stop })}
      />
      <p role="status" className="text-meta">{statusText}</p>
      <div>
        <Button onClick={() => void save()}>Save budgets</Button>
      </div>
    </Card>
  );
}
