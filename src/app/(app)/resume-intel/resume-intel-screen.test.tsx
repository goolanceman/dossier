import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResumeCritique } from "@/lib/ai/task-contracts";
import { findingsByPriority } from "@/lib/resume-intel/critique";

import { deleteCritique, runCritique } from "./actions";
import { ResumeIntel } from "./resume-intel";
import type { CritiqueSummary, CritiqueView } from "./view";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  runCritique: vi.fn(async () => ({ ok: true, data: { jobId: "job-1" } })),
  openCritique: vi.fn(
    async (): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> => ({ ok: false, error: "not opened" }),
  ),
  deleteCritique: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/resume-intel" }));
vi.mock("@/hooks/use-job", () => ({ useJob: () => null }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: { ok: boolean }) => result }));
vi.mock("./actions", () => actions);

const finding = (id: string, severity: ResumeCritique["findings"][number]["severity"], category: ResumeCritique["findings"][number]["category"]) => ({
  id,
  category,
  severity,
  title: `Finding ${id}`,
  currentProblem: "The summary reads generically.",
  recommendation: "Name the domain and the outcome.",
  expectedImpact: "Stronger first screen.",
  effort: "LIGHT" as const,
  evidenceRequired: ["a metric"],
  relatedJobRequirements: ["Ownership"],
  confidence: "HIGH" as const,
});

// Stored out of order, as the model may answer; the action returns them via
// findingsByPriority, so the list reads most important first.
const critique: ResumeCritique = {
  schema_version: "1.0",
  task: "resume_critique",
  overall: { score: 58, atsReadiness: "FAIR", summary: "Solid roles, thin evidence." },
  findings: [finding("f-low", "LOW", "WRITING"), finding("f-critical", "CRITICAL", "ATS"), finding("f-medium", "MEDIUM", "CONTENT")],
  keywordCoverage: ["Missing: Kubernetes"],
  formattingIssues: ["Two-column layout"],
  strengths: ["Clear titles"],
};

const view = (over: Partial<CritiqueView> = {}): CritiqueView => ({
  id: "c1",
  fileName: "resume.pdf",
  date: "17 Nov 2026",
  targetId: null,
  overall: critique.overall,
  // What openCritique returns: the findings already in priority order.
  findings: findingsByPriority(critique),
  keywordCoverage: critique.keywordCoverage,
  formattingIssues: critique.formattingIssues,
  strengths: [],
  ...over,
});

const summary = (over: Partial<CritiqueSummary> = {}): CritiqueSummary => ({
  id: "c1",
  fileName: "resume.pdf",
  date: "17 Nov 2026",
  score: 58,
  atsReadiness: "FAIR",
  ...over,
});

const open = (props: Partial<Parameters<typeof ResumeIntel>[0]> = {}) =>
  render(
    <ResumeIntel
      aiReady
      initialJobId={null}
      critiques={[summary()]}
      targets={[{ id: "t1", title: "Senior Backend Engineer", summary: "Owns payments platforms at scale." }]}
      {...props}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  actions.openCritique.mockResolvedValue({ ok: false, error: "not opened" });
});

describe("ResumeIntel", () => {
  it("shows the upload card with a paste fallback and an empty history", () => {
    open({ critiques: [] });
    expect(screen.getByRole("heading", { level: 1, name: "Resume intelligence" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your resume, as PDF, Word (.docx), Markdown or text")).toHaveAccessibleName();
    expect(screen.getByLabelText("Or paste the resume's text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run critique" })).toBeInTheDocument();
    expect(screen.getByText("No critiques yet. Run one above and it will be kept here.")).toBeInTheDocument();
  });

  it("offers a target to critique against", () => {
    open();
    const select = screen.getByLabelText("Critique against");
    expect(within(select).getByRole("option", { name: "No target: a general critique" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Senior Backend Engineer" })).toBeInTheDocument();
  });

  it("replaces Run critique with a muted note while no AI provider is set up", () => {
    open({ aiReady: false });
    expect(screen.getByRole("note")).toHaveTextContent("No AI provider is set up yet, so nothing can critique the resume.");
    expect(screen.queryByRole("button", { name: "Run critique" })).not.toBeInTheDocument();
    expect(screen.getByText("Run critique becomes available once an AI provider is set up.")).toBeInTheDocument();
  });

  it("shows the file's name and size once it is chosen", async () => {
    const user = userEvent.setup();
    open();
    await user.upload(screen.getByLabelText("Your resume, as PDF, Word (.docx), Markdown or text"), new File(["x"], "cv.pdf", { type: "application/pdf" }));
    expect(screen.getByText("cv.pdf · 1 KB")).toBeInTheDocument();
  });

  it("starts a critique of pasted text through the action", async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText("Or paste the resume's text"), "Jane Doe, designer");
    await user.click(screen.getByRole("button", { name: "Run critique" }));
    expect(runCritique).toHaveBeenCalledWith({ content: "Jane Doe, designer", targetId: "" });
    expect(router.replace).toHaveBeenCalledWith("/resume-intel?job=job-1");
  });

  it("passes the chosen target into the action", async () => {
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText("Or paste the resume's text"), "Jane Doe, designer");
    await user.selectOptions(screen.getByLabelText("Critique against"), "t1");
    await user.click(screen.getByRole("button", { name: "Run critique" }));
    expect(runCritique).toHaveBeenCalledWith({ content: "Jane Doe, designer", targetId: "t1" });
  });

  it("opens a stored critique with its findings in severity order and the internal-estimate disclaimer", async () => {
    const user = userEvent.setup();
    actions.openCritique.mockResolvedValue({ ok: true, data: view() });
    open();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("img", { name: "Internal diagnostic estimate: 58 of 100" })).toBeInTheDocument());
    expect(
      screen.getByText("This score is an internal diagnostic estimate, not an employer screening result."),
    ).toBeInTheDocument();
    expect(screen.getByText("ATS readiness: fair")).toBeInTheDocument();

    const improvements = screen.getByRole("list", { name: "Improvements by priority" });
    const titles = within(improvements).getAllByRole("button").map((button) => button.textContent ?? "");
    findingsByPriority(critique).forEach((finding, index) => expect(titles[index]).toContain(`Finding ${finding.id}`));
    // Critical reads as red, low as muted; each finding opens its details.
    const [critical, , low] = within(improvements).getAllByRole("button");
    expect(critical).toHaveTextContent("critical");
    expect(low).toHaveTextContent("low");
  });

  it("links a finding that needs evidence to the achievements in Career", async () => {
    const user = userEvent.setup();
    actions.openCritique.mockResolvedValue({ ok: true, data: view() });
    open();
    await user.click(screen.getByRole("button", { name: "Open" }));
    // Every finding asks for evidence, so each one links to the library.
    const links = await screen.findAllByRole("link", { name: "Add this evidence to your library" });
    expect(links).toHaveLength(critique.findings.length);
    for (const link of links) expect(link).toHaveAttribute("href", "/career");
  });

  it("asks before deleting a critique, then refreshes the history", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Delete…" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete this critique?" });
    expect(deleteCritique).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete critique" }));
    expect(deleteCritique).toHaveBeenCalledWith({ id: "c1" });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("keeps the history rows readable: file name, date and the internal estimate", () => {
    open({ critiques: [summary(), summary({ id: "c2", fileName: "", date: "1 Nov 2026", score: null, atsReadiness: null })] });
    expect(screen.getByText("resume.pdf")).toBeInTheDocument();
    expect(screen.getByText("Base resume")).toBeInTheDocument();
    expect(screen.getByText("17 Nov 2026 · internal estimate 58/100")).toBeInTheDocument();
    expect(screen.getByText("1 Nov 2026")).toBeInTheDocument();
  });
});
