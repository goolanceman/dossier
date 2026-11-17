import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SalaryStatus } from "@/generated/prisma/enums";
import {
  answerGapQuestion,
  assessPosting,
  createLearningPlan,
  critiquePosting,
  generateGapQuestions,
  markGapQuestionUnknown,
  overrideAssessment,
  prepareInterview,
  researchCompany,
  researchSalary,
  saveGapQuestionForLater,
  skipGapQuestion,
} from "./actions";
import { IntelligenceScreen, type AssessmentView, type IntelligenceScreenProps, type SalaryEstimateView } from "./intelligence-screen";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => null }));
vi.mock("next/link", () => ({ default: ({ href, ...props }: ComponentProps<"a">) => <a href={href} {...props} /> }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));
vi.mock("@/hooks/use-job", () => ({ useJob: vi.fn(() => null) }));
vi.mock("./actions", () => ({
  assessPosting: vi.fn(),
  researchSalary: vi.fn(),
  critiquePosting: vi.fn(),
  generateGapQuestions: vi.fn(),
  prepareInterview: vi.fn(),
  createLearningPlan: vi.fn(),
  researchCompany: vi.fn(),
  overrideAssessment: vi.fn(),
  answerGapQuestion: vi.fn(),
  skipGapQuestion: vi.fn(),
  markGapQuestionUnknown: vi.fn(),
  saveGapQuestionForLater: vi.fn(),
}));

const weights = { technicalSkills: 25, relevantExperience: 20, responsibilities: 15, architecture: 10, seniority: 10, domain: 5, locationRemote: 10, employmentConditions: 5 };

const baseProps: IntelligenceScreenProps = {
  posting: { id: "p1", title: "Backend Engineer", company: "Northwind", place: "Berlin", remote: true, salary: "", postedAt: "2026-11-14T00:00:00.000Z", url: "https://jobs.example/1", via: "LinkedIn" },
  today: "2026-11-17T12:00:00.000Z",
  aiReady: true,
  weights,
  assessment: null,
  critique: null,
  estimate: null,
  evidence: {},
  gaps: [],
  companyResearch: null,
  hasInterviewPlan: false,
  hasLearningPlan: false,
};

const assessment: AssessmentView = {
  decision: "STRONG_MATCH",
  score: 82,
  confidence: "HIGH",
  dimensions: { technicalSkills: 90, relevantExperience: 85, responsibilities: 80, architecture: 70, seniority: 80, domain: 60, locationRemote: 90, employmentConditions: 75 },
  requirements: [
    {
      requirement: "Kubernetes production experience",
      importance: "REQUIRED",
      status: "STRONG_EVIDENCE",
      evidenceIds: ["ach-1"],
      jdQuotes: ["You will run our Kubernetes clusters"],
      explanation: "Production cluster work.",
      confidence: "MEDIUM",
    },
    { requirement: "Rust", importance: "REQUIRED", status: "CONFIRMED_GAP", evidenceIds: [], jdQuotes: ["Strong Rust skills"], explanation: "Nothing backs it.", confidence: "MEDIUM" },
  ],
  reasons: ["AI recommendation APPLY, weighted score 82 of 100.", "No mandatory rejection rule matched."],
  rejectedReason: "",
  userOverride: "",
};

const estimate = (status: SalaryStatus, extra: Partial<SalaryEstimateView> = {}) => ({
  status,
  statusLabel: { STATED: "Stated in the job ad", CONFIRMED: "Publicly confirmed", ESTIMATED: "Estimated from market data", UNAVAILABLE: "Unavailable" }[status],
  minimum: 60000,
  median: 67500,
  maximum: 75000,
  currency: "EUR",
  basis: "ANNUAL",
  confidence: "MEDIUM",
  sourceCount: 1,
  sources: [{ url: "https://www.glassdoor.com/Salary/northwind", label: "Glassdoor", retrievedAt: "2026-11-17" }],
  methodology: "Midpoint of the ranges two sources give.",
  ...extra,
});

function renderScreen(props: Partial<IntelligenceScreenProps> = {}) {
  return render(<IntelligenceScreen {...baseProps} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assessPosting).mockResolvedValue({ ok: true, data: { jobId: "job-1" } });
  vi.mocked(researchSalary).mockResolvedValue({ ok: true, data: { jobId: "job-2" } });
  vi.mocked(critiquePosting).mockResolvedValue({ ok: true, data: { jobId: "job-3" } });
  vi.mocked(generateGapQuestions).mockResolvedValue({ ok: true, data: { jobId: "job-4" } });
  vi.mocked(prepareInterview).mockResolvedValue({ ok: true, data: { jobId: "job-5" } });
  vi.mocked(createLearningPlan).mockResolvedValue({ ok: true, data: { jobId: "job-6" } });
  vi.mocked(researchCompany).mockResolvedValue({ ok: true, data: { jobId: "job-7" } });
  vi.mocked(overrideAssessment).mockResolvedValue({ ok: true, data: null, toast: "Noted." });
  vi.mocked(answerGapQuestion).mockResolvedValue({ ok: true, data: null, toast: "Answer saved." });
  vi.mocked(skipGapQuestion).mockResolvedValue({ ok: true, data: null, toast: "Skipped." });
  vi.mocked(markGapQuestionUnknown).mockResolvedValue({ ok: true, data: null, toast: "Marked as unknown." });
  vi.mocked(saveGapQuestionForLater).mockResolvedValue({ ok: true, data: null, toast: "Saved for later." });
});

describe("the header", () => {
  it("names the posting with its facts and links out", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Backend Engineer" })).toBeInTheDocument();
    expect(screen.getByText("Northwind · Berlin · Remote · Posted 3 days ago · via LinkedIn")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open posting/ })).toHaveAttribute("href", "https://jobs.example/1");
    expect(screen.getByRole("link", { name: /Open posting/ })).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("the compatibility section (master.md §3.2)", () => {
  it("shows the score, the decision, the confidence and every dimension with its weight", () => {
    renderScreen({ assessment });
    expect(screen.getByRole("img", { name: "Score 82 of 100" })).toBeInTheDocument();
    expect(screen.getByText("Strong match · 82 of 100")).toBeInTheDocument();
    expect(screen.getByText("Confidence: High")).toBeInTheDocument();
    expect(screen.getByText("Technical skills")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("Architecture and system design")).toBeInTheDocument();
    expect(screen.getByText("15%")).toBeInTheDocument();
    expect(screen.getByText("Salary and employment conditions")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Technical skills: 90 of 100" })).toBeInTheDocument();
  });

  it("says why it landed there", () => {
    renderScreen({ assessment });
    const reasons = screen.getByRole("list", { name: "Why the assessment landed here" });
    expect(within(reasons).getByText("AI recommendation APPLY, weighted score 82 of 100.")).toBeInTheDocument();
    expect(within(reasons).getByText("No mandatory rejection rule matched.")).toBeInTheDocument();
  });

  it("calls out a mandatory rejection when one forced the decision", () => {
    renderScreen({ assessment: { ...assessment, decision: "REJECT", rejectedReason: "The pay stated in the advert tops out below your minimum." } });
    expect(screen.getByRole("note")).toHaveTextContent(/Mandatory rejection\. The pay stated in the advert tops out below your minimum\./);
  });

  it("records an override with its reasoning (master.md §3.4)", async () => {
    const { unmount } = renderScreen({ assessment });
    await userEvent.click(screen.getByRole("button", { name: "Disagree" }));
    await userEvent.type(screen.getByLabelText("Why do you disagree?"), "The Rust gap is closing.");
    await userEvent.click(screen.getByRole("button", { name: "Save override" }));
    expect(overrideAssessment).toHaveBeenCalledWith({ postingId: "p1", reasoning: "The Rust gap is closing." });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    unmount();

    // Once made, the override reads back with its reasoning.
    renderScreen({ assessment: { ...assessment, userOverride: "The Rust gap is closing." } });
    expect(screen.getByText(/You overrode this:/)).toBeInTheDocument();
    expect(screen.getByText("The Rust gap is closing.")).toBeInTheDocument();
  });

  it("asks again with Assess again", async () => {
    renderScreen({ assessment });
    await userEvent.click(screen.getByRole("button", { name: "Assess again" }));
    expect(assessPosting).toHaveBeenCalledWith({ postingId: "p1" });
  });
});

describe("the requirement mapping (master.md §3.3)", () => {
  it("maps every requirement with its importance, status, evidence and the posting's own words", () => {
    renderScreen({ assessment, evidence: { "ach-1": "Runs production Kubernetes" } });
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // the head plus two requirements

    const first = within(rows[1]!);
    expect(first.getByText("Kubernetes production experience")).toBeInTheDocument();
    expect(first.getByText("Required")).toBeInTheDocument();
    expect(first.getByText("Strong evidence")).toBeInTheDocument();
    expect(first.getByRole("link", { name: "Runs production Kubernetes" })).toHaveAttribute("href", "/career");
    expect(first.getByText("“You will run our Kubernetes clusters”")).toBeInTheDocument();
    expect(first.getByText("Confidence: Medium")).toBeInTheDocument();

    const second = within(rows[2]!);
    expect(second.getByText("Confirmed gap")).toBeInTheDocument();
    expect(second.getByText("None in your library")).toBeInTheDocument();
    expect(second.getByText("“Strong Rust skills”")).toBeInTheDocument();
  });

  it("keeps transferable experience apart from direct experience", () => {
    renderScreen({ assessment: { ...assessment, requirements: [{ ...assessment.requirements[0], status: "TRANSFERABLE" }] } });
    expect(screen.getByText("Transferable")).toBeInTheDocument();
    expect(screen.getByText(/Transferable experience is not direct experience/)).toBeInTheDocument();
  });

  it("says when there is nothing to map", () => {
    renderScreen({ assessment: { ...assessment, requirements: [] } });
    expect(screen.getByText("The assessment found no requirements to map.")).toBeInTheDocument();
  });
});

describe("the salary section (master.md Phase 4)", () => {
  it("labels an estimate as an estimate, never as confirmed", () => {
    renderScreen({ estimate: estimate("ESTIMATED") });
    expect(screen.getByText("Estimated from market data")).toBeInTheDocument();
    expect(screen.queryByText("Publicly confirmed")).not.toBeInTheDocument();
    expect(screen.getByText("EUR 60,000 – EUR 75,000")).toBeInTheDocument();
    expect(screen.getByText("a year")).toBeInTheDocument();
    expect(screen.getByText("Median EUR 67,500")).toBeInTheDocument();
    expect(screen.getByText("Midpoint of the ranges two sources give.")).toBeInTheDocument();
    const source = screen.getByRole("link", { name: /Glassdoor/ });
    expect(source).toHaveAttribute("href", "https://www.glassdoor.com/Salary/northwind");
    expect(screen.getByText("(www.glassdoor.com) · retrieved 2026-11-17")).toBeInTheDocument();
  });

  it("labels a stated figure as stated", () => {
    renderScreen({ estimate: estimate("STATED") });
    expect(screen.getByText("Stated in the job ad")).toBeInTheDocument();
  });

  it("says Unavailable without inventing a figure", () => {
    renderScreen({ estimate: estimate("UNAVAILABLE", { minimum: null, median: null, maximum: null, sourceCount: 0, sources: [] }) });
    // The figure and its label both say Unavailable; no number is dressed up.
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText("No trustworthy figure exists. Nothing is invented to fill the gap.")).toBeInTheDocument();
    expect(screen.queryByText(/60,000/)).not.toBeInTheDocument();
  });

  it("offers the research when the ad states nothing and nothing is on record", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Research salary" }));
    expect(researchSalary).toHaveBeenCalledWith({ postingId: "p1" });
  });

  it("sends the reader to Settings when no AI provider is set up", () => {
    renderScreen({ aiReady: false });
    expect(screen.queryByRole("button", { name: "Research salary" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Set one up in Settings" }).length).toBeGreaterThanOrEqual(1);
  });
});

describe("the critique section (master.md §3.4)", () => {
  it("shows the recommendation and the critique's fields", () => {
    renderScreen({
      assessment,
      critique: {
        attractive: [],
        suitable: ["“Kubernetes production experience” — Production cluster work."],
        lacking: ["“Rust” — Nothing backs it."],
        hiddenRequirements: [],
        interviewDifficulty: "",
        seniorityMismatch: "",
        concerns: [],
        progression: "",
        salaryCompetitiveness: "",
        recommendation: "APPLY_AFTER_PREPARATION",
        reasoning: "Worked out from the assessment (derived-from-assessment).",
      },
    });
    expect(screen.getByText("Apply after preparation")).toBeInTheDocument();
    expect(screen.getByText("Why you're suitable")).toBeInTheDocument();
    expect(screen.getByText("“Rust” — Nothing backs it.")).toBeInTheDocument();
    expect(screen.getByText("Worked out from the assessment (derived-from-assessment).")).toBeInTheDocument();
    // Empty fields are left out rather than shown empty.
    expect(screen.queryByText("What makes the position attractive")).not.toBeInTheDocument();
  });

  it("offers to generate one while there is none", async () => {
    renderScreen({ assessment });
    expect(screen.getByText(/No critique yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Generate critique" }));
    expect(critiquePosting).toHaveBeenCalledWith({ postingId: "p1" });
  });

  it("has no generate button before an assessment", () => {
    renderScreen();
    expect(screen.queryByRole("button", { name: "Generate critique" })).not.toBeInTheDocument();
  });
});

describe("the gap questions (master.md Phase 6)", () => {
  const gaps = [
    { id: "g1", question: "What volume did your Kafka systems process?", reason: "The JD asks for high-throughput systems", relatedRequirement: "High-throughput distributed systems", questionType: "METRICS", priority: "CRITICAL" },
  ];

  it("asks each open question with its four ways through", async () => {
    renderScreen({ gaps });
    expect(screen.getByText("What volume did your Kafka systems process?")).toBeInTheDocument();
    expect(screen.getByText("On: High-throughput distributed systems · Critical · Metrics")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Your answer to: What volume/), "About 2 million messages a day.");
    await userEvent.click(screen.getByRole("button", { name: "Answer" }));
    expect(answerGapQuestion).toHaveBeenCalledWith({ id: "g1", answer: "About 2 million messages a day." });

    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(skipGapQuestion).toHaveBeenCalledWith({ id: "g1" });
    await userEvent.click(screen.getByRole("button", { name: "Unknown" }));
    expect(markGapQuestionUnknown).toHaveBeenCalledWith({ id: "g1" });
    await userEvent.click(screen.getByRole("button", { name: "Save for later" }));
    expect(saveGapQuestionForLater).toHaveBeenCalledWith({ id: "g1" });
  });

  it("waits for an answer before Answer does anything", async () => {
    renderScreen({ gaps });
    await userEvent.click(screen.getByRole("button", { name: "Answer" }));
    expect(answerGapQuestion).not.toHaveBeenCalled();
  });

  it("offers to generate the questions when there are none", async () => {
    renderScreen({ assessment });
    await userEvent.click(screen.getByRole("button", { name: "Generate gap questions" }));
    expect(generateGapQuestions).toHaveBeenCalledWith({ postingId: "p1" });
  });
});

describe("the next steps (master.md Phases 7–8)", () => {
  it("prepares interview questions and says where they land", async () => {
    renderScreen({ assessment });
    expect(screen.getByRole("link", { name: "Interview prep" })).toHaveAttribute("href", "/interview");
    await userEvent.click(screen.getByRole("button", { name: "Prepare interview" }));
    expect(prepareInterview).toHaveBeenCalledWith({ postingId: "p1" });
  });

  it("makes a learning plan from the assessment's gaps", async () => {
    renderScreen({ assessment });
    await userEvent.click(screen.getByRole("button", { name: "Make a learning plan" }));
    expect(createLearningPlan).toHaveBeenCalledWith({ postingId: "p1" });
  });

  it("names the buttons again when plans already exist", () => {
    renderScreen({ assessment, hasInterviewPlan: true, hasLearningPlan: true });
    expect(screen.getByRole("button", { name: "Prepare interview again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make a new learning plan" })).toBeInTheDocument();
  });

  it("runs one job at a time, so the other AI buttons wait", async () => {
    renderScreen({ assessment });
    await userEvent.click(screen.getByRole("button", { name: "Prepare interview" }));
    await userEvent.click(screen.getByRole("button", { name: "Make a learning plan" }));
    expect(prepareInterview).toHaveBeenCalledTimes(1);
    expect(createLearningPlan).not.toHaveBeenCalled();
  });
});

describe("the company research (master.md Phase 9)", () => {
  const research = {
    schema_version: "1.0" as const,
    task: "company_research" as const,
    overview: "A freight platform.",
    products: [{ fact: "Freight tracking.", sourceUrl: "https://northwind.example/product", kind: "CONFIRMED" as const }, { fact: "Moving into insurance.", sourceUrl: "", kind: "INTERPRETATION" as const }],
    techStack: ["Kubernetes", "Rust"],
    engineeringCulture: [],
    recentDevelopments: [],
    funding: "",
    companySize: "",
    locations: [],
    remotePolicy: "",
    whyCompany: "",
    whyRole: "",
    checklist: [],
    questionsToAsk: [],
  };

  it("shows confirmed facts with their source host and interpretations as interpretations", () => {
    renderScreen({ companyResearch: { research, sources: [], researchedWith: "company-research@1" } });
    expect(screen.getByText("A freight platform.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Confirmed · northwind.example" })).toHaveAttribute("href", "https://northwind.example/product");
    expect(screen.getByText("Interpretation — check this yourself")).toBeInTheDocument();
    expect(screen.getByText("Kubernetes")).toBeInTheDocument();
  });

  it("says when everything is interpretation because no sources were available", () => {
    renderScreen({ companyResearch: { research: { ...research, products: [{ fact: "Moving into insurance.", sourceUrl: "", kind: "INTERPRETATION" }] }, sources: [], researchedWith: "company-research@1" } });
    expect(screen.getByRole("note")).toHaveTextContent(/No sources were available to research from, so everything here is interpretation/);
  });

  it("offers to research the company when there is none", async () => {
    renderScreen({ assessment });
    await userEvent.click(screen.getByRole("button", { name: "Research company" }));
    expect(researchCompany).toHaveBeenCalledWith({ postingId: "p1" });
  });
});

describe("before an assessment", () => {
  it("offers the assessment and holds the deep sections back", async () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Not assessed yet" })).toBeInTheDocument();
    expect(screen.queryByText("Requirement mapping")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prepare interview" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Assess this posting" }));
    expect(assessPosting).toHaveBeenCalledWith({ postingId: "p1" });
  });

  it("replaces every AI button with a note to Settings", () => {
    renderScreen({ aiReady: false });
    expect(screen.getAllByRole("link", { name: "Set one up in Settings" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: "Assess this posting" })).not.toBeInTheDocument();
  });
});
