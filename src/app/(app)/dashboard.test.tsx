import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CareerIntel, DashboardFigures } from "@/lib/dashboard";

import { rememberQuietDays } from "./actions";
import { CareerIntelSection } from "./dashboard-career-intel";
import { Dashboard } from "./dashboard";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => null, useSearchParams: () => new URLSearchParams() }));
vi.mock("./actions", () => ({ rememberDashboardPeriod: vi.fn(), rememberQuietDays: vi.fn(async () => ({ ok: true, data: null })) }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));
// The career intelligence section loads its own data from the database, which the component tests haven't got:
// the section itself is still the real one, and is tested directly below.
vi.mock("./dashboard-career-intel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./dashboard-career-intel")>()),
  DashboardCareerIntel: () => null,
}));

const figures: DashboardFigures = {
  total: 9,
  byStatus: { DRAFT: 2, SENT: 2, SCREENING: 1, INTERVIEW: 1, OFFER: 1, ACCEPTED: 0, REJECTED: 1, DECLINED: 1 },
  funnel: [
    { stage: "SENT", count: 7, conversion: null, stopped: { open: 2, rejected: 0, declined: 0, archived: 0 } },
    { stage: "SCREENING", count: 5, conversion: 71, stopped: { open: 1, rejected: 1, declined: 0, archived: 0 } },
    { stage: "INTERVIEW", count: 3, conversion: 60, stopped: { open: 1, rejected: 0, declined: 0, archived: 0 } },
    { stage: "OFFER", count: 2, conversion: 67, stopped: { open: 1, rejected: 0, declined: 1, archived: 0 } },
    { stage: "ACCEPTED", count: 0, conversion: 0, stopped: { open: 0, rejected: 0, declined: 0, archived: 0 } },
  ],
  sent: 7,
  heardBack: 5,
  heardBackPercent: 71,
  reachedInterview: 3,
  attention: [
    { id: "oaken", company: "Oaken Studio", role: "Design Systems Lead", status: "OFFER", reason: "An offer is waiting on your decision.", action: "Review" },
    { id: "brightline", company: "Brightline Transit", role: "Senior Service Designer", status: "DRAFT", reason: "Still a draft, and applications close 3 Oct.", action: "Finish" },
  ],
  weeks: [],
};
const props = { figures, firstName: "Jane", period: "afternoon" as const, empty: false };

afterEach(() => vi.useRealTimers());

describe("the dashboard (E9-7)", () => {
  it("greets by the local time and sums up the search", () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 28, 9), toFake: ["Date"] });
    render(<Dashboard {...props} />);
    expect(screen.getByRole("heading", { level: 1, name: "Good morning, Jane" })).toBeInTheDocument();
    expect(screen.getByText("You've sent 7 applications and heard back from 5. That's a solid run. Keep it going.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ New application" })).toHaveAttribute("href", "/new?fresh=1");
    expect(document.cookie).toMatch(/dossier-tz=/);
  });

  it("encourages before anything was sent", () => {
    render(<Dashboard {...props} figures={{ ...figures, sent: 0, heardBack: 0, heardBackPercent: null }} />);
    expect(screen.getByText("Nothing sent yet. Your first application is only a paste away.")).toBeInTheDocument();
  });

  it("says which period the summary covers (E9-8)", () => {
    const { rerender } = render(<Dashboard {...props} range="30d" />);
    expect(screen.getByText("In the last 30 days you've sent 7 applications and heard back from 5. That's a solid run. Keep it going.")).toBeInTheDocument();
    rerender(<Dashboard {...props} range="90d" figures={{ ...figures, sent: 0, heardBack: 0, heardBackPercent: null }} />);
    expect(screen.getByText("Nothing sent in the last 90 days. Your next application is only a paste away.")).toBeInTheDocument();
  });

  it("shows the funnel with its figures and notes, in words", () => {
    render(<Dashboard {...props} />);
    const funnel = screen.getByRole("region", { name: "Your funnel" });
    expect(within(funnel).getAllByRole("definition").map((value) => value.textContent)).toEqual(["7", "71%", "3"]);
    expect(within(funnel).getAllByRole("listitem").map((step) => step.textContent)).toEqual([
      "Sent7Everything you've sent",
      "Screening571% of sent",
      "Interview360% of screening",
      "Offer267% of interview",
      "Accepted0None yet",
    ]);
  });

  it("breaks down where things stand, with a link to the board", () => {
    render(<Dashboard {...props} />);
    const standing = screen.getByRole("region", { name: "Where things stand" });
    expect(within(standing).getByRole("link", { name: "Open board" })).toHaveAttribute("href", "/applications?view=board");
    const accepted = within(standing).getByText("Accepted").closest("li")!;
    expect(accepted).toHaveTextContent("Accepted0");
    expect(accepted).toHaveClass("text-muted");
  });

  it("lists what's worth a look, each opening its application", () => {
    render(<Dashboard {...props} />);
    const attention = screen.getByRole("region", { name: "Worth a look" });
    expect(within(attention).getByText("2 things")).toBeInTheDocument();
    const [offer] = within(attention).getAllByRole("link");
    expect(offer).toHaveAttribute("href", "/applications/oaken");
    expect(offer).toHaveTextContent("Oaken Studio, Design Systems LeadAn offer is waiting on your decision.Review →");
  });

  it("flags an interview today or tomorrow (E9-9)", () => {
    const interview = {
      id: "northstar",
      company: "Northstar Health",
      role: "Lead Product Designer",
      status: "INTERVIEW" as const,
      reason: "Interview tomorrow at 14:00. Worth re-reading your tailored letter first.",
      action: "Open" as const,
      soon: true,
    };
    render(<Dashboard {...props} figures={{ ...figures, attention: [interview, ...figures.attention] }} />);
    const [first, second] = within(screen.getByRole("region", { name: "Worth a look" })).getAllByRole("link");
    expect(first).toHaveTextContent("Northstar Health, Lead Product DesignerSoonInterview tomorrow at 14:00.");
    expect(second).not.toHaveTextContent("Soon");
  });

  it("sets how long without news before a follow-up is suggested (E9-9)", async () => {
    const user = userEvent.setup();
    render(<Dashboard {...props} quietDays={7} />);
    const threshold = within(screen.getByRole("region", { name: "Worth a look" })).getByLabelText("Suggest a follow-up after");
    expect(threshold).toHaveValue("7");
    expect(within(threshold).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "3 days",
      "5 days",
      "7 days",
      "10 days",
      "14 days",
      "21 days",
      "30 days",
    ]);
    await user.selectOptions(threshold, "14");
    expect(rememberQuietDays).toHaveBeenCalledWith({ days: 14 });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("keeps a threshold that isn't one of the choices", () => {
    render(<Dashboard {...props} quietDays={8} />);
    expect(screen.getByLabelText("Suggest a follow-up after")).toHaveValue("8");
  });

  it("is all caught up when nothing needs attention", () => {
    render(<Dashboard {...props} figures={{ ...figures, attention: [] }} />);
    expect(screen.getByText("All caught up. Nice.")).toBeInTheDocument();
  });

  it("welcomes a new user", () => {
    render(<Dashboard {...props} empty figures={{ ...figures, sent: 0 }} />);
    expect(screen.getByRole("heading", { name: "Welcome to Dossier" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fill in your profile" })).toHaveAttribute("href", "/profile");
    expect(screen.queryByRole("region", { name: "Your funnel" })).not.toBeInTheDocument();
  });

  it("shows the calendar after the cards, outside the time filter (E15-6)", () => {
    const calendar = <section aria-label="Calendar" />;
    const { rerender } = render(<Dashboard {...props} calendar={calendar} />);
    const region = screen.getByRole("region", { name: "Calendar" });
    expect(screen.getByRole("region", { name: "Worth a look" }).compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Not among the cards, which dim while another period loads.
    expect(screen.getByRole("region", { name: "Your funnel" }).parentElement!.contains(region)).toBe(false);
    // A new user has the calendar too.
    rerender(<Dashboard {...props} empty calendar={calendar} />);
    expect(screen.getByRole("region", { name: "Calendar" })).toBeInTheDocument();
  });
});

describe("the career intelligence section (Phase 14)", () => {
  const intel: CareerIntel = {
    newJobs: 12,
    bestMatches: [
      { postingId: "lumen", title: "Senior Service Designer", company: "Lumen Works", score: 92, decision: "STRONG_MATCH" },
      { postingId: "fieldnote", title: "Product Designer", company: "Fieldnote", score: 78, decision: "POTENTIAL_MATCH" },
    ],
    review: { jobs: 3, questions: 2 },
    progress: { preparedQuestions: 8, totalQuestions: 20, completedTopics: 2, totalTopics: 5, mockSessions: 3, mockMeanScore: 74 },
    salaries: [
      { id: "s1", title: "Senior Service Designer", company: "Lumen Works", range: "€70,000 – €90,000", statusLabel: "Stated in the job ad", postingId: "lumen" },
      { id: "s2", title: "", company: "", range: null, statusLabel: "Unavailable", postingId: null },
    ],
    usage: { calls: 14, failures: 1, inputTokens: 12345, outputTokens: 6789, estimatedCost: null },
    actions: [
      { reason: "2 gap questions wait for answers.", href: "/interview", action: "Answer" },
      { reason: "3 jobs wait for your review.", href: "/discovery", action: "Review" },
      { reason: "12 interview questions are left to prepare.", href: "/interview", action: "Prepare" },
    ],
  };

  it("shows what discovery found, and links the best matches to their intelligence pages", () => {
    render(<CareerIntelSection intel={intel} />);
    const section = screen.getByRole("region", { name: "Career intelligence" });
    expect(within(section).getByText("New jobs discovered")).toBeInTheDocument();
    expect(within(section).getByText("12")).toBeInTheDocument();
    expect(within(section).getByText("in the last 7 days")).toBeInTheDocument();
    const matches = within(section).getAllByRole("link", { name: /Strong match|Potential match/ });
    expect(matches.map((match) => match.getAttribute("href"))).toEqual(["/intelligence/lumen", "/intelligence/fieldnote"]);
    expect(matches[0]).toHaveTextContent("Lumen Works, Senior Service Designer92 · Strong match");
  });

  it("counts what requires review, and links each count where it's answered", () => {
    render(<CareerIntelSection intel={intel} />);
    const section = screen.getByRole("region", { name: "Career intelligence" });
    for (const link of within(section).getAllByRole("link", { name: /3 jobs wait for your review/ })) expect(link).toHaveAttribute("href", "/discovery");
    for (const link of within(section).getAllByRole("link", { name: /2 gap questions wait for answers/ })) expect(link).toHaveAttribute("href", "/interview");
  });

  it("shows how the preparation stands, with the mock sessions' mean score", () => {
    render(<CareerIntelSection intel={intel} />);
    const section = screen.getByRole("region", { name: "Career intelligence" });
    expect(within(section).getByText("Preparation progress")).toBeInTheDocument();
    expect(within(section).getByText("8 of 20")).toBeInTheDocument();
    expect(within(section).getByText("2 of 5")).toBeInTheDocument();
    expect(within(section).getByText("3 · mean score 74")).toBeInTheDocument();
  });

  it("shows the salary research with where each figure came from, and only links a row that has a page", () => {
    render(<CareerIntelSection intel={intel} />);
    const section = screen.getByRole("region", { name: "Career intelligence" });
    expect(within(section).getByRole("link", { name: /€70,000 – €90,000 · Stated in the job ad/ })).toHaveAttribute("href", "/intelligence/lumen");
    const untied = within(section).getByText("Salary research").closest("div")!;
    expect(untied.querySelector("a")).toBeNull();
    expect(untied).toHaveTextContent("Unavailable");
  });

  it("reports AI use honestly: calls and failures, and only the tokens that were reported", () => {
    render(<CareerIntelSection intel={intel} />);
    const section = screen.getByRole("region", { name: "Career intelligence" });
    expect(within(section).getByText("14 · 1 failure")).toBeInTheDocument();
    expect(within(section).getByText("12,345 in · 6,789 out")).toBeInTheDocument();
    expect(within(section).queryByText(/Estimated cost/)).not.toBeInTheDocument();
  });

  it("recommends what to do next, each going where it's done", () => {
    render(<CareerIntelSection intel={intel} />);
    const section = screen.getByRole("region", { name: "Career intelligence" });
    expect(within(section).getByRole("link", { name: /12 interview questions are left to prepare/ })).toHaveAttribute("href", "/interview");
    expect(within(section).getAllByRole("link", { name: / →$/ }).length).toBeGreaterThanOrEqual(3);
  });

  it("hides the blocks that have nothing to show", () => {
    render(
      <CareerIntelSection
        intel={{
          ...intel,
          newJobs: null,
          review: { jobs: 0, questions: 2 },
          progress: null,
          salaries: [],
          usage: { calls: 0, failures: 0, inputTokens: null, outputTokens: null, estimatedCost: null },
          actions: [],
        }}
      />,
    );
    const section = screen.getByRole("region", { name: "Career intelligence" });
    expect(within(section).queryByText("New jobs discovered")).not.toBeInTheDocument();
    expect(within(section).getByText("Best matches")).toBeInTheDocument();
    expect(within(section).queryByText(/jobs wait for your review/)).not.toBeInTheDocument();
    expect(within(section).getByText("2 gap questions wait for answers.")).toBeInTheDocument();
    expect(within(section).queryByText("Preparation progress")).not.toBeInTheDocument();
    expect(within(section).queryByText("Salary insights")).not.toBeInTheDocument();
    expect(within(section).getByText("No AI activity in the last 7 days.")).toBeInTheDocument();
    expect(within(section).queryByText("Recommended next actions")).not.toBeInTheDocument();
  });

  it("hides the whole section when there's nothing at all to show", () => {
    render(<CareerIntelSection intel={null} />);
    expect(screen.queryByRole("region", { name: "Career intelligence" })).not.toBeInTheDocument();
  });
});
