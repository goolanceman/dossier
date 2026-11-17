import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/career" }));
vi.mock("@/hooks/use-job", () => ({ useJob: () => null }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));
// The actions stand in: the tests watch what the section calls, not the server.
vi.mock("./actions", () => ({
  generateCareerPlan: vi.fn(async () => ({ ok: true as const, data: { jobId: "job-1" } })),
  toggleAction: vi.fn(async () => ({ ok: true as const, data: null })),
  removePlan: vi.fn(async () => ({ ok: true as const, data: null })),
}));

import type { CareerPlanView } from "@/lib/career/plan";
import type { TargetView } from "@/lib/career/targets";

import { generateCareerPlan, removePlan, toggleAction } from "./actions";
import { CareerPlanSection } from "./career-plan-section";

// The plan section: the list of plans, their goals to work through, and the
// generate form. The AI's part is done by the time it renders; what the user
// does here is read, check actions off, and delete plans they're past.

const primaryTarget = {
  id: "t1",
  title: "Staff Backend Engineer",
  summary: "",
  preferences: { seniority: "Staff", salaryMin: null, currency: "EUR", remoteCountries: [], priorities: [], keywords: [] },
  primary: true,
  sort: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
} as TargetView;

const plan = {
  id: "p1",
  targetId: "t1",
  basedOn: "PROFILE",
  headline: "From backend to staff engineer",
  summary: "The plan, in a line.",
  critiqueId: null,
  planWith: "career-plan@1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  target: { title: "Staff Backend Engineer" },
  items: {
    goals: [
      {
        id: "G1",
        title: "Own production systems end to end",
        horizon: "NOW",
        why: "Staff roles ask for it.",
        actions: [
          { id: "A1", action: "Ship a design doc", effort: "LIGHT", evidenceIds: [], done: true },
          { id: "A2", action: "Lead an incident review", effort: "MEDIUM", evidenceIds: [] },
        ],
        milestones: ["Design doc reviewed"],
      },
      {
        id: "G2",
        title: "Grow into distributed systems depth",
        horizon: "LATER",
        why: "The target asks for scale.",
        actions: [{ id: "A3", action: "Take a systems course", effort: "HEAVY", evidenceIds: [] }],
        milestones: [],
      },
    ],
    risks: ["Spreading across too many targets at once."],
  },
} as CareerPlanView;

const emptyPlan = {
  ...plan,
  id: "p2",
  headline: "",
  target: null,
  items: { goals: [], risks: [] },
} as CareerPlanView;

describe("CareerPlanSection", () => {
  it("shows its count, the empty state, and the generate button while the AI is configured", () => {
    render(<CareerPlanSection plans={[]} targets={[]} aiReady={true} hasResume={false} />);
    expect(screen.getByRole("heading", { name: "Career plan (0)" })).toBeInTheDocument();
    expect(screen.getByText(/No plans yet\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate a plan" })).toBeInTheDocument();
  });

  it("hides the generate form behind the muted note when the AI is not configured", () => {
    render(<CareerPlanSection plans={[]} targets={[]} aiReady={false} hasResume={false} />);
    expect(screen.queryByRole("button", { name: "Generate a plan" })).not.toBeInTheDocument();
    expect(screen.getByText(/connect an AI provider in/i)).toBeInTheDocument();
  });

  it("lists a plan with its headline, horizon counts, progress, basedOn badge and target", () => {
    render(<CareerPlanSection plans={[plan]} targets={[primaryTarget]} aiReady={true} hasResume={true} />);
    expect(screen.getByRole("heading", { name: "Career plan (1)" })).toBeInTheDocument();
    expect(screen.getByText("From backend to staff engineer")).toBeInTheDocument();
    // Horizon chips (only the horizons that have goals) and the progress line.
    expect(screen.getByText("1 now · 1 later · 1 of 3 actions done")).toBeInTheDocument();
    expect(screen.getByText("From profile")).toBeInTheDocument();
    expect(screen.getByText("Aim: Staff Backend Engineer")).toBeInTheDocument();
    // The detail is closed until the card is expanded.
    expect(screen.queryByText("Own production systems end to end")).not.toBeInTheDocument();
  });

  it("expands a plan into its goals grouped now, next, later, with milestones and risks last", async () => {
    render(<CareerPlanSection plans={[plan]} targets={[]} aiReady={true} hasResume={true} />);
    await userEvent.click(screen.getByRole("button", { name: /From backend to staff engineer/ }));
    // The groups come in horizon order, skipping the empty ones.
    const now = screen.getByRole("heading", { name: "Now" });
    const later = screen.getByRole("heading", { name: "Later" });
    expect(now.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Own production systems end to end")).toBeInTheDocument();
    expect(screen.getByText("Staff roles ask for it.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Ship a design doc/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Lead an incident review/ })).not.toBeChecked();
    expect(screen.getByText("Design doc reviewed")).toBeInTheDocument();
    // The risks block comes at the end.
    expect(screen.getByRole("heading", { name: "Risks" })).toBeInTheDocument();
    expect(screen.getByText("Spreading across too many targets at once.")).toBeInTheDocument();
  });

  it("checks an action at once, and sends the toggle as the user made it", async () => {
    render(<CareerPlanSection plans={[plan]} targets={[]} aiReady={true} hasResume={true} />);
    await userEvent.click(screen.getByRole("button", { name: /From backend to staff engineer/ }));
    const checkbox = screen.getByRole("checkbox", { name: /Lead an incident review/ });
    await userEvent.click(checkbox);
    // Optimistic: checked before the server answers, and the toggle sent.
    expect(checkbox).toBeChecked();
    expect(toggleAction).toHaveBeenCalledWith({ planId: "p1", actionId: "A2", done: true });
    // Unchecking goes through the same path with done: false.
    await userEvent.click(checkbox);
    expect(toggleAction).toHaveBeenLastCalledWith({ planId: "p1", actionId: "A2", done: false });
  });

  it("offers the delete dialog from the expanded card, and removes through it", async () => {
    render(<CareerPlanSection plans={[plan]} targets={[]} aiReady={true} hasResume={true} />);
    await userEvent.click(screen.getByRole("button", { name: /From backend to staff engineer/ }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("Delete plan?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete plan" }));
    await waitFor(() => expect(removePlan).toHaveBeenCalledWith({ id: "p1" }));
  });

  it("starts the generate job from the form, with the base and the target asked for", async () => {
    render(<CareerPlanSection plans={[plan]} targets={[primaryTarget]} aiReady={true} hasResume={true} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate a plan" }));
    expect(screen.getByRole("radio", { name: "Profile" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Resume" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Aim at" }), "t1");
    await userEvent.click(screen.getByRole("button", { name: "Generate plan" }));
    expect(generateCareerPlan).toHaveBeenCalledWith({ basedOn: "RESUME", targetId: "t1" });
    // The form closes and the progress line takes over.
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Generate plan" })).not.toBeInTheDocument();
  });

  it("asks for a resume first when the plan would be based on one that does not exist", async () => {
    render(<CareerPlanSection plans={[]} targets={[]} aiReady={true} hasResume={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate a plan" }));
    await userEvent.click(screen.getByRole("radio", { name: "Resume" }));
    expect(screen.getByText(/There is no resume yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate plan" })).toBeDisabled();
  });

  it("shows an empty plan honestly: untitled, with no actions yet", async () => {
    render(<CareerPlanSection plans={[emptyPlan]} targets={[]} aiReady={false} hasResume={false} />);
    expect(screen.getAllByText("Career plan")).toHaveLength(2);
    expect(screen.getByText("No actions yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /No actions yet/ }));
    expect(screen.getByText("This plan has no goals in it.")).toBeInTheDocument();
  });
});
