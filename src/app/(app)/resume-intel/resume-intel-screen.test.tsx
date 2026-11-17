import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResumeCritique } from "@/lib/ai/task-contracts";
import { demoProfile, demoResumeUnits } from "@/lib/demo-profile";
import { findingsByPriority } from "@/lib/resume-intel/critique";
import { DEFAULT_SECTION_LAYOUT } from "@/lib/resume-sections";
import { BUILT_IN_THEMES } from "@/lib/themes";

import { deleteCritique, runCritique } from "./actions";
import { ResumeIntel } from "./resume-intel";
import type { CritiqueSummary, CritiqueView } from "./view";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  runCritique: vi.fn(async () => ({ ok: true, data: { jobId: "job-1" } })),
  runBaseCritique: vi.fn(async () => ({ ok: true, data: { jobId: "job-1" } })),
  applyFindings: vi.fn(async () => ({ ok: true, data: { jobId: "job-2" } })),
  addFindingEvidence: vi.fn(async () => ({ ok: true, data: { achievementId: "ach-1" } })),
  runCareerPlan: vi.fn(async () => ({ ok: true, data: { jobId: "job-3" } })),
  openMasterDocument: vi.fn(async () => ({ ok: true, data: { master: null } })),
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

const master = () => ({
  id: "doc-1",
  units: demoResumeUnits(),
  theme: BUILT_IN_THEMES[0]!,
  paper: "A4" as const,
  sections: DEFAULT_SECTION_LAYOUT,
  includeReferences: false,
  language: null,
});

const open = (props: Partial<Parameters<typeof ResumeIntel>[0]> = {}) =>
  render(
    <ResumeIntel
      aiReady
      initialJobId={null}
      critiques={[summary()]}
      targets={[{ id: "t1", title: "Senior Backend Engineer", summary: "Owns payments platforms at scale." }]}
      profile={demoProfile()}
      baseResume={{ name: "Jane Doe", headline: "Senior Product Designer", words: 312 }}
      master={null}
      {...props}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  actions.openCritique.mockResolvedValue({ ok: false, error: "not opened" });
});

describe("ResumeIntel", () => {
  it("shows the two critique modes with the base resume's line and word count", () => {
    open();
    expect(screen.getByRole("heading", { level: 1, name: "Resume intelligence" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Base resume" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Upload" })).toBeInTheDocument();
    expect(screen.getByText(/Your base resume:/)).toHaveTextContent("Jane Doe · Senior Product Designer · about 312 words");
    expect(screen.getByRole("button", { name: "Critique base resume" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Or paste the resume's text")).not.toBeInTheDocument();
  });

  it("starts the base-resume critique with the mode in the job input, no resume text attached", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Critique base resume" }));
    expect(actions.runBaseCritique).toHaveBeenCalledWith({ targetId: "" });
    expect(router.replace).toHaveBeenCalledWith("/resume-intel?job=job-1");
  });

  it("passes the chosen target into the base-resume critique", async () => {
    const user = userEvent.setup();
    open();
    await user.selectOptions(screen.getByLabelText("Critique against"), "t1");
    await user.click(screen.getByRole("button", { name: "Critique base resume" }));
    expect(actions.runBaseCritique).toHaveBeenCalledWith({ targetId: "t1" });
  });

  it("keeps the upload flow under the Upload tab: file, paste and the run button", async () => {
    const user = userEvent.setup();
    open({ critiques: [] });
    expect(screen.getByText("No critiques yet. Run one above and it will be kept here.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Upload" }));
    expect(screen.getByLabelText("Your resume, as PDF, Word (.docx), Markdown or text")).toHaveAccessibleName();
    expect(screen.getByLabelText("Or paste the resume's text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run critique" })).toBeInTheDocument();
  });

  it("offers a target to critique against", () => {
    open();
    const select = screen.getByLabelText("Critique against");
    expect(within(select).getByRole("option", { name: "No target: a general critique" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Senior Backend Engineer" })).toBeInTheDocument();
  });

  it("replaces the run buttons with muted notes while no AI provider is set up", () => {
    open({ aiReady: false });
    expect(screen.getByRole("note")).toHaveTextContent("No AI provider is set up yet, so nothing can critique the resume.");
    expect(screen.queryByRole("button", { name: "Critique base resume" })).not.toBeInTheDocument();
    expect(screen.getByText("Critiquing becomes available once an AI provider is set up.")).toBeInTheDocument();
  });

  it("shows the file's name and size once it is chosen", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("tab", { name: "Upload" }));
    await user.upload(screen.getByLabelText("Your resume, as PDF, Word (.docx), Markdown or text"), new File(["x"], "cv.pdf", { type: "application/pdf" }));
    expect(screen.getByText("cv.pdf · 1 KB")).toBeInTheDocument();
  });

  it("starts a critique of pasted text through the action", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("tab", { name: "Upload" }));
    await user.type(screen.getByLabelText("Or paste the resume's text"), "Jane Doe, designer");
    await user.click(screen.getByRole("button", { name: "Run critique" }));
    expect(runCritique).toHaveBeenCalledWith({ content: "Jane Doe, designer", targetId: "" });
    expect(router.replace).toHaveBeenCalledWith("/resume-intel?job=job-1");
  });

  it("passes the chosen target into the paste flow's action", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("tab", { name: "Upload" }));
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
    // The rows' toggle buttons alone: each evidence chip is a button of its own.
    const titles = within(improvements).getAllByRole("button", { expanded: true }).map((button) => button.textContent ?? "");
    findingsByPriority(critique).forEach((finding, index) => expect(titles[index]).toContain(`Finding ${finding.id}`));
    // Critical reads as red, low as muted; each finding opens its details.
    const [critical, , low] = within(improvements).getAllByRole("button", { expanded: true });
    expect(critical).toHaveTextContent("critical");
    expect(low).toHaveTextContent("low");
  });

  it("ticks critical findings for applying and lets the rest be chosen", async () => {
    const user = userEvent.setup();
    actions.openCritique.mockResolvedValue({ ok: true, data: view() });
    open();
    await user.click(screen.getByRole("button", { name: "Open" }));
    // Critical and high start ticked; the demo critique has one critical finding.
    const critical = screen.getByRole("checkbox", { name: "Apply finding: Finding f-critical" });
    expect(critical).toBeChecked();
    const low = screen.getByRole("checkbox", { name: "Apply finding: Finding f-low" });
    expect(low).not.toBeChecked();

    await user.click(low);
    expect(screen.getByRole("button", { name: "Apply 2 findings" })).toBeInTheDocument();
    await user.click(low);
    expect(screen.getByRole("button", { name: "Apply 1 finding" })).toBeInTheDocument();
  });

  it("applies the ticked findings as a job", async () => {
    const user = userEvent.setup();
    actions.openCritique.mockResolvedValue({ ok: true, data: view() });
    open();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: "Apply 1 finding" }));
    expect(actions.applyFindings).toHaveBeenCalledWith({ critiqueId: "c1", findingIds: ["f-critical"] });
    expect(router.replace).toHaveBeenCalledWith("/resume-intel?job=job-2");
  });

  it("adds a finding's evidence to the library, then its chips link to Career", async () => {
    const user = userEvent.setup();
    actions.openCritique.mockResolvedValue({ ok: true, data: view() });
    open();
    await user.click(screen.getByRole("button", { name: "Open" }));
    // Each finding's evidence is a chip with a "+" affordance before it is added.
    const chips = await screen.findAllByRole("button", { name: "Add this evidence to your library: a metric" });
    expect(chips).toHaveLength(critique.findings.length);
    await user.click(chips[0]!);
    expect(actions.addFindingEvidence).toHaveBeenCalledWith({ critiqueId: "c1", findingId: "f-critical" });
    // The chip of the finding that was added turns into a link to the library.
    await waitFor(() => expect(screen.getAllByRole("link", { name: "a metric" })).toHaveLength(1));
    expect(screen.getAllByRole("link", { name: "a metric" })[0]).toHaveAttribute("href", "/career");
  });

  it("previews the master resume with its PDF and print links", () => {
    open({ master: master() });
    expect(screen.getByRole("heading", { name: "Your master resume" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", "/api/pdf/doc-1");
    expect(screen.getByRole("link", { name: "Print" })).toHaveAttribute("href", "/print/RESUME/doc-1");
    // The document renders from the master's own units, not the bare profile.
    expect(screen.getByText(demoResumeUnits()[0]!.text)).toBeInTheDocument();
  });

  it("keeps the master resume actions and the applied summary out of sight until they exist", () => {
    open();
    expect(screen.queryByRole("heading", { name: "Your master resume" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("plans career goals from the resume, passing the open critique along", async () => {
    const user = userEvent.setup();
    actions.openCritique.mockResolvedValue({ ok: true, data: view() });
    open();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: "Create a career plan" }));
    expect(actions.runCareerPlan).toHaveBeenCalledWith({ critiqueId: "c1" });
    expect(router.replace).toHaveBeenCalledWith("/resume-intel?job=job-3");
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
    // Scoped to the history: the mode tab is called "Base resume" too.
    const history = within(screen.getByRole("region", { name: "Earlier critiques" }));
    expect(history.getByText("resume.pdf")).toBeInTheDocument();
    expect(history.getByText("Base resume")).toBeInTheDocument();
    expect(history.getByText("17 Nov 2026 · internal estimate 58/100")).toBeInTheDocument();
    expect(history.getByText("1 Nov 2026")).toBeInTheDocument();
  });
});
