import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { IntelligencePanel, type IntelligenceView } from "./intelligence-panel";

const full: IntelligenceView = {
  postingId: "posting-1",
  assessment: { decision: "STRONG_MATCH", score: 82 },
  salary: { label: "Estimated from market data", range: "EUR 60,000 to EUR 75,000 a year" },
  openGaps: 3,
  interviewPlans: [
    {
      id: "plan-1",
      role: "Senior Backend Engineer at Example Co",
      rounds: [
        { name: "Recruiter", focus: "Screening" },
        { name: "Technical", focus: "Core skills" },
        { name: "System design", focus: "Architecture" },
        { name: "Hiring manager", focus: "Fit" },
        { name: "Culture", focus: "Values" },
      ],
      questions: 10,
      prepared: 4,
    },
  ],
  learningPlans: [{ id: "plan-2", goal: "Be ready for the interviews", completed: 2, total: 5 }],
  companyResearched: true,
  documents: [
    { kind: "RESUME", writtenWith: "tailor-resume@1" },
    { kind: "COVER_LETTER", writtenWith: null },
  ],
};

const none: IntelligenceView = {
  postingId: null,
  assessment: null,
  salary: null,
  openGaps: 0,
  interviewPlans: [],
  learningPlans: [],
  companyResearched: false,
  documents: [],
};

describe("the intelligence panel (master.md Phase 10)", () => {
  it("starts collapsed and opens to every artifact with its link when all are connected", async () => {
    const user = userEvent.setup();
    render(<IntelligencePanel intelligence={full} />);
    expect(screen.getByRole("heading", { name: "Intelligence" })).toBeInTheDocument();
    expect(screen.getByText("8 of 8 connected")).toBeInTheDocument();
    expect(screen.queryByText("Job assessment")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("Strong match")).toBeInTheDocument();
    expect(screen.getByText("82 of 100")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open job intelligence" })).toHaveAttribute("href", "/intelligence/posting-1#compatibility");
    expect(screen.getByText("Estimated from market data")).toBeInTheDocument();
    expect(screen.getByText("EUR 60,000 to EUR 75,000 a year")).toBeInTheDocument();
    expect(screen.getByText("3 open")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Answer them" })).toHaveAttribute("href", "/intelligence/posting-1#gaps");
    expect(screen.getByRole("link", { name: "Senior Backend Engineer at Example Co" })).toHaveAttribute("href", "/interview?plan=plan-1");
    expect(screen.getByText("5 rounds · 4 of 10 questions prepared")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Be ready for the interviews" })).toHaveAttribute("href", "/interview?learning=plan-2");
    expect(screen.getByText("2 of 5 topics done")).toBeInTheDocument();
    expect(screen.getByText("Researched")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open company research" })).toHaveAttribute("href", "/intelligence/posting-1#company");
    expect(screen.getByText("Written with tailor-resume@1")).toBeInTheDocument();
    expect(screen.getByText("Written without AI")).toBeInTheDocument();
  });

  it("folds up again", async () => {
    const user = userEvent.setup();
    render(<IntelligencePanel intelligence={full} />);
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText("Job assessment")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show" })).toHaveAttribute("aria-expanded", "false");
  });

  it("shows a not-yet hint with the way to each absent artifact, and only what exists", async () => {
    const user = userEvent.setup();
    render(
      <IntelligencePanel
        intelligence={{
          ...none,
          postingId: "posting-2",
          assessment: { decision: "WEAK_MATCH", score: null },
        }}
      />,
    );
    expect(screen.getByText("1 of 8 connected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show" }));

    expect(screen.getByText("Weak match")).toBeInTheDocument();
    expect(screen.queryByText("82 of 100")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open job intelligence" })).toHaveAttribute("href", "/intelligence/posting-2#compatibility");
    expect(screen.getByText("No salary research yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open salary research" })).toHaveAttribute("href", "/intelligence/posting-2#salary");
    expect(screen.getByText("No open gap questions.")).toBeInTheDocument();
    expect(screen.getByText("No interview preparation yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open interview prep" })).toHaveAttribute("href", "/interview");
    expect(screen.getByText("No learning plan yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open learning plans" })).toHaveAttribute("href", "/interview");
    expect(screen.getByText("Not researched yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open company research" })).toHaveAttribute("href", "/intelligence/posting-2#company");
    expect(screen.getByText("No tailored resume yet.")).toBeInTheDocument();
    expect(screen.getByText("No cover letter yet.")).toBeInTheDocument();
  });

  it("offers no links to a job's intelligence when the application has no posting", async () => {
    const user = userEvent.setup();
    render(
      <IntelligencePanel
        intelligence={{
          ...none,
          openGaps: 2,
          documents: [{ kind: "RESUME", writtenWith: "tailor-resume@1" }],
        }}
      />,
    );
    expect(screen.getByText("2 of 8 connected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.queryByRole("link", { name: "Open job intelligence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open salary research" })).not.toBeInTheDocument();
    expect(screen.getByText("2 open")).toBeInTheDocument();
    expect(screen.getByText("Written with tailor-resume@1")).toBeInTheDocument();
    expect(screen.getByText("No cover letter yet.")).toBeInTheDocument();
  });

  it("is a compact empty state when nothing is connected", () => {
    render(<IntelligencePanel intelligence={none} />);
    expect(screen.getByText("Nothing connected yet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Job assessment")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
