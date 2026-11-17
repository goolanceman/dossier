import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/interview" }));
vi.mock("@/hooks/use-job", () => ({ useJob: () => null }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));

import { MockKind, MockStatus } from "@/generated/prisma/enums";
import type { MockFeedback } from "@/lib/ai/task-contracts";
import type { SessionView } from "@/lib/interview/mock";

import { InterviewScreen, type InterviewScreenProps } from "./interview-screen";
import { PREDICTED_DISCLAIMER } from "./plans-section";

// The hub with nothing in it, the readiness arithmetic over real counts, the
// AI gating, and the two drill-downs (a plan, a mock session).

const emptyProps: InterviewScreenProps = {
  aiReady: true,
  readiness: { questions: [], sessions: [], storyCount: 0, unansweredGaps: 0 },
  plans: [],
  plan: null,
  sessions: [],
  session: null,
  sessionQuestions: [],
  stories: [],
  achievements: [],
  evidence: {},
  postings: [],
  targets: [],
  learningPlans: [],
  learningPlan: null,
};

type QuestionShape = NonNullable<InterviewScreenProps["plan"]>["questions"][number];

const question = (overrides: Partial<QuestionShape> = {}): QuestionShape => ({
  id: "q1",
  category: "TECHNICAL",
  difficulty: "ADVANCED",
  question: "How would you design a rate limiter?",
  whyAsked: "It is on the JD",
  expectedTopics: ["token bucket"],
  answerStructure: ["define", "example"],
  evidenceIds: ["ach-1"],
  followUps: ["What about a cluster?"],
  commonMistakes: ["Ignoring the clock"],
  resources: ["Rate limiting patterns"],
  prepared: false,
  ...overrides,
});

const planDetail: InterviewScreenProps["plan"] = {
  id: "p1",
  role: "Senior Backend Engineer",
  rounds: [{ name: "Recruiter", focus: "Screening" }],
  preparedWith: "interview-prep@1",
  createdAt: new Date("2026-01-01"),
  questions: [question()],
};

const feedback: MockFeedback = {
  schema_version: "1.0",
  task: "mock_feedback",
  technicalAccuracy: 80,
  structure: 70,
  depth: 60,
  communication: 90,
  evidenceUse: 50,
  strengths: ["Clear structure"],
  improvements: ["Add numbers"],
  suggestedAnswerPoints: ["Start with the outcome"],
};

const session = (overrides: Partial<SessionView> = {}): SessionView => ({
  id: "s1",
  planId: null,
  kind: MockKind.TEXT,
  status: MockStatus.IN_PROGRESS,
  turns: [],
  feedback: null,
  score: null,
  startedAt: new Date("2026-01-01"),
  finishedAt: null,
  ...overrides,
});

describe("InterviewScreen", () => {
  it("renders every section with its empty state when the hub is new", () => {
    render(<InterviewScreen {...emptyProps} />);
    expect(screen.getByRole("heading", { level: 1, name: "Interview prep" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Readiness" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Interview plans" })).toBeInTheDocument();
    expect(screen.getByText(/No interview plans yet\./)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mock interviews" })).toBeInTheDocument();
    expect(screen.getByText(/No mock interviews yet\./)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "STAR story bank" })).toBeInTheDocument();
    expect(screen.getByText(/No STAR stories yet\./)).toBeInTheDocument();
    expect(screen.getByText(/No learning plans yet\./)).toBeInTheDocument();
    // The voice note (master.md §7.5 "if supported"), honest about this pass.
    expect(screen.getByText(/Voice interviews need a provider that supports it\./)).toBeInTheDocument();
  });

  it("computes readiness from the counts it is given, never from an AI", () => {
    render(
      <InterviewScreen
        {...emptyProps}
        readiness={{
          // Technical 1 of 1 prepared, behavioral 0 of 1, no system design.
          questions: [
            { category: "TECHNICAL", difficulty: "ADVANCED", prepared: true },
            { category: "BEHAVIORAL", difficulty: "INTERMEDIATE", prepared: false },
          ],
          sessions: [{ kind: "TEXT", status: "COMPLETED", score: 70 }],
          storyCount: 1,
          // Two gaps at 2 points each, one passing session at 5: 50 + 5 - 4.
          unansweredGaps: 2,
        }}
      />,
    );
    expect(screen.getByLabelText("Overall readiness: 51 of 100")).toBeInTheDocument();
    expect(screen.getByLabelText("Technical: 100 of 100")).toBeInTheDocument();
    expect(screen.getByLabelText("Behavioral: 0 of 100")).toBeInTheDocument();
    expect(screen.getByLabelText("System design: 0 of 100")).toBeInTheDocument();
    expect(screen.getByText("Getting there. Prepare the weakest areas first.")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 questions prepared/)).toBeInTheDocument();
    expect(screen.getByText(/not an AI opinion/)).toBeInTheDocument();
  });

  it("shows the AI note instead of the generate buttons when no provider is set up", () => {
    render(<InterviewScreen {...emptyProps} aiReady={false} />);
    expect(screen.getAllByText(/This needs an AI provider\./).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Generate plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New plan" })).not.toBeInTheDocument();
  });

  it("shows a plan with its questions, the disclaimer and the prepared toggle", () => {
    render(<InterviewScreen {...emptyProps} plan={planDetail} evidence={{ "ach-1": "Cut checkout p99 by 40%" }} />);
    expect(screen.getByRole("heading", { name: "Senior Backend Engineer" })).toBeInTheDocument();
    expect(screen.getByText(PREDICTED_DISCLAIMER)).toBeInTheDocument();
    expect(screen.getByText("How would you design a rate limiter?")).toBeInTheDocument();
    expect(screen.getByText("Why asked: It is on the JD")).toBeInTheDocument();
    expect(screen.getByText("Evidence to draw on: Cut checkout p99 by 40%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepared" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Suggest stories" })).toBeInTheDocument();
    // The plan list stays reachable, and the filters are chips.
    expect(screen.getByRole("button", { name: "All plans" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All categories" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All difficulties" })).toBeInTheDocument();
  });

  it("runs the mock interview one question at a time, with the verdict inline", () => {
    const asked = session({
      turns: [{ question: "How would you design a rate limiter?", answer: "Token bucket in Redis.", feedback }],
      status: MockStatus.COMPLETED,
      score: 70,
    });
    render(<InterviewScreen {...emptyProps} session={asked} sessionQuestions={[question()]} />);
    // The question is on the plate (with its verdict) and in the transcript.
    expect(screen.getAllByText("How would you design a rate limiter?").length).toBeGreaterThan(0);
    expect(screen.getByText("The interviewer's verdict")).toBeInTheDocument();
    expect(screen.getByLabelText("Technical accuracy: 80 of 100")).toBeInTheDocument();
    expect(screen.getByText("Strengths")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next question" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument();
    // The transcript keeps what was said, with the grade it earned.
    const transcript = screen.getByText("This session so far").closest("div")!;
    expect(within(transcript).getByText("Token bucket in Redis.")).toBeInTheDocument();
    expect(within(transcript).getByText("Graded: 70 of 100")).toBeInTheDocument();
  });
});
