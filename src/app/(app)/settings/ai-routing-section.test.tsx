import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";

import { saveBudgets, saveTaskRouting, setTaskEnabled } from "./actions";
import { AiRoutingSection, type AppDefault, type BudgetsView, type TaskRoutingRow, type UsageView } from "./ai-routing-section";

vi.mock("./actions", () => ({ saveTaskRouting: vi.fn(), setTaskEnabled: vi.fn(), saveBudgets: vi.fn() }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: { ok: boolean; error?: string }) => (result.ok ? result : (toast(result.error!), result)) }));

const appDefault: AppDefault = { providerName: "Local model", model: "qwen2.5:3b" };

const assessed: TaskRoutingRow = {
  task: "assess-job",
  label: "Job assessment",
  description: "The deep pass on a shortlisted posting: fit score, requirement evidence and the job critique.",
  enabled: true,
  providerChoice: "",
  providerName: "Local model",
  savedModel: "",
  resolvedModel: "qwen2.5:3b",
  temperature: "",
  maxTokens: null,
  timeoutSeconds: null,
  retries: null,
  fallbackModel: "",
  contextLimit: null,
  maxConcurrency: null,
};

const salary: TaskRoutingRow = {
  task: "salary-research",
  label: "Salary research",
  description: "Researches what a role pays, from the posting and public sources.",
  enabled: true,
  providerChoice: "ANTHROPIC",
  providerName: "Anthropic",
  savedModel: "claude-sonnet-5",
  resolvedModel: "claude-sonnet-5",
  temperature: "0.2",
  maxTokens: 2000,
  timeoutSeconds: 120,
  retries: 1,
  fallbackModel: "mistral-medium-latest",
  contextLimit: 100_000,
  maxConcurrency: 3,
};

const usage: UsageView = {
  tasks: [
    { task: "assess-job", label: "Job assessment", calls: 12, failures: 1, inputTokens: 3400, outputTokens: 2100, durationMs: 90_400, reportsTokens: true },
    { task: "salary-research", label: "Salary research", calls: 4, failures: 0, inputTokens: 0, outputTokens: 0, durationMs: 4_000, reportsTokens: false },
  ],
  anyCost: true,
  totalCostCents: 214,
};

const budgets: BudgetsView = {
  dailyCents: 500,
  monthlyCents: null,
  stop: true,
  status: { exceeded: false, window: "none", spentCents: 214, budgetCents: 500 },
};

const open = (props: { rows?: TaskRoutingRow[]; usage?: UsageView; budgets?: BudgetsView } = {}) =>
  render(
    <AiRoutingSection
      rows={props.rows ?? [assessed, salary, { ...assessed, task: "screen-posting", label: "Posting screen", description: "The discovery pipeline's cheap screen.", enabled: false }]}
      appDefault={appDefault}
      usage={props.usage ?? usage}
      budgets={props.budgets ?? budgets}
    />,
  );

beforeEach(() => {
  vi.mocked(saveTaskRouting).mockReset().mockResolvedValue({ ok: true, data: null });
  vi.mocked(setTaskEnabled).mockReset().mockResolvedValue({ ok: true, data: null });
  vi.mocked(saveBudgets).mockReset().mockResolvedValue({ ok: true, data: { status: budgets.status } });
});

describe("Settings → AI models & usage (master.md §11.3–11.4)", () => {
  it("shows one row per task with the provider and model it would run on", () => {
    open();
    expect(screen.getAllByText("Job assessment").length).toBeGreaterThan(0);
    expect(screen.getByText("Runs on Local model with qwen2.5:3b.")).toBeInTheDocument();
    expect(screen.getByText("Runs on Anthropic with claude-sonnet-5.")).toBeInTheDocument();
    expect(screen.getByText("Switched off. Tasks that run through it fail until it's on.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Job assessment" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Salary research" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Posting screen" })).toHaveAttribute("aria-checked", "false");
  });

  it("switches a task on and off, saved on its own", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("switch", { name: "Posting screen" }));
    expect(setTaskEnabled).toHaveBeenCalledWith({ task: "screen-posting", enabled: true });
    expect(screen.getByRole("switch", { name: "Salary research" })).toHaveAttribute("aria-checked", "true");
  });

  it("says a task is off, and switches back when the save failed", async () => {
    const user = userEvent.setup();
    vi.mocked(setTaskEnabled).mockResolvedValueOnce({ ok: false, error: "Couldn't reach the server." });
    open({ rows: [assessed] });
    await user.click(screen.getByRole("switch", { name: "Job assessment" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Job assessment" })).toHaveAttribute("aria-checked", "true"));
    expect(toast).toHaveBeenCalledWith("Couldn't reach the server.");
  });

  it("opens a task's routing form, prefilled with what it runs on", async () => {
    const user = userEvent.setup();
    open();
    expect(screen.queryByLabelText("Fallback model")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit routing for Salary research" }));
    expect(screen.getByLabelText("Provider")).toHaveValue("ANTHROPIC");
    expect(screen.getByLabelText("Model")).toHaveValue("claude-sonnet-5");
    expect(screen.getByLabelText("Temperature")).toHaveValue("0.2");
    expect(screen.getByLabelText("Max tokens")).toHaveValue("2000");
    expect(screen.getByLabelText("Max calls at once")).toHaveValue("3");
    // Blank means "follow the app default", so the option is there for every field.
    expect(screen.getByRole("option", { name: "Follow the app default (Local model)" })).toBeInTheDocument();
  });

  it("saves the routing as typed, and blanks follow the defaults", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Edit routing for Job assessment" }));
    await user.selectOptions(screen.getByLabelText("Provider"), "MISTRAL");
    await user.type(screen.getByLabelText("Model"), "mistral-medium-latest");
    await user.type(screen.getByLabelText("Temperature"), "0.5");
    await user.click(screen.getByRole("button", { name: "Save routing" }));
    expect(saveTaskRouting).toHaveBeenCalledWith({
      task: "assess-job",
      provider: "MISTRAL",
      model: "mistral-medium-latest",
      temperature: "0.5",
      maxTokens: null,
      timeoutSeconds: null,
      retries: null,
      fallbackModel: "",
      contextLimit: null,
      maxConcurrency: null,
    });
    await waitFor(() => expect(screen.getByText("Runs on Mistral with mistral-medium-latest.")).toBeInTheDocument());
  });

  it("notes the fallback in the usage log when a task has one", () => {
    open();
    expect(screen.getByText(/the call's usage entry names the fallback model/)).toBeInTheDocument();
  });

  it("shows the usage per task, and says when a provider reports no tokens", () => {
    open();
    expect(screen.getByRole("cell", { name: "12" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(screen.getByText("3,400")).toBeInTheDocument();
    expect(screen.getByText("Not reported by this provider")).toBeInTheDocument();
    expect(screen.getByText("Estimated cost so far: 214 cents, from the prices the providers reported.")).toBeInTheDocument();
  });

  it("shows an empty usage table honestly, with no cost anywhere", () => {
    open({ usage: { tasks: [], anyCost: false, totalCostCents: 0 } });
    expect(screen.getByText("No AI calls in the last 30 days.")).toBeInTheDocument();
    expect(screen.getByText("No provider has reported a cost yet, so the totals stay empty. Token counts are only what providers report: Dossier never estimates them.")).toBeInTheDocument();
  });

  it("saves the budgets and answers with the spend they can see", async () => {
    const user = userEvent.setup();
    open();
    expect(screen.getByLabelText("Daily budget (cents)")).toHaveValue("500");
    expect(screen.getByLabelText("Monthly budget (cents)")).toHaveValue("");
    expect(screen.getByText("Used so far: 214 of 500 cents.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Stop all AI tasks when a budget is exceeded" })).toHaveAttribute("aria-checked", "true");

    await user.type(screen.getByLabelText("Monthly budget (cents)"), "1000");
    await user.click(screen.getByRole("button", { name: "Save budgets" }));
    expect(saveBudgets).toHaveBeenCalledWith({ dailyCents: 500, monthlyCents: 1000, stop: true });
  });

  it("says when no budget is set, and when one tripped", () => {
    const { unmount } = open({ budgets: { dailyCents: null, monthlyCents: null, stop: false, status: null } });
    expect(screen.getByText("No budget set: nothing stops the AI tasks.")).toBeInTheDocument();
    unmount();
    open({
      budgets: { dailyCents: 100, monthlyCents: null, stop: true, status: { exceeded: true, window: "daily", spentCents: 100, budgetCents: 100 } },
    });
    expect(screen.getByText("The daily budget is used up: 100 of 100 cents. AI tasks stop until it resets.")).toBeInTheDocument();
  });
});
