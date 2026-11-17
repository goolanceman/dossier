import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/career" }));
vi.mock("@/hooks/use-job", () => ({ useJob: () => null }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));

import { EvidenceStatus } from "@/generated/prisma/enums";
import type { AchievementView } from "@/lib/career/achievements";
import type { KnowledgeDocView } from "@/lib/career/knowledge";
import type { TargetView } from "@/lib/career/targets";

import { AchievementsSection } from "./achievements-section";
import { CareerScreen } from "./career-screen";
import { KnowledgeSection } from "./knowledge-section";
import { TargetsSection } from "./targets-section";

// The screen with nothing in it yet: the frame, the sections and their empty
// states (empty states are the feature when a library is new).

const importedAchievement = {
  id: "a1",
  title: "Cut checkout p99 by 40%",
  description: "Led the checkout rewrite.",
  detail: "",
  company: "Fieldnote",
  position: "Backend Engineer",
  project: "",
  technologies: ["Postgres"],
  metrics: ["p99 latency 40% lower"],
  scale: "",
  ownership: "",
  complexity: "",
  problem: "",
  action: "",
  outcome: "",
  businessImpact: "",
  evidenceUrl: "",
  evidenceNotes: "",
  status: EvidenceStatus.IMPORTED,
  tags: [],
  skills: [],
  experienceId: null,
  versions: [],
  origin: "doc:d1",
  sort: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
} as AchievementView;

const primaryTarget = {
  id: "t1",
  title: "Staff Backend Engineer",
  summary: "",
  preferences: { seniority: "Staff", salaryMin: 90_000, currency: "EUR", remoteCountries: [], priorities: [], keywords: [] },
  primary: true,
  sort: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
} as TargetView;

const reviewedDoc = {
  id: "d1",
  name: "CV 2026",
  kind: "RESUME",
  content: "",
  sourceUrl: "",
  status: "REVIEWED" as const,
  findings: null,
  achievementIds: ["a1"],
  reviewedWith: "doc-findings@1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
} as KnowledgeDocView;

describe("CareerScreen", () => {
  it("has the header and the three sections, the current one marked", () => {
    render(
      <CareerScreen section="targets">
        <p>Section body</p>
      </CareerScreen>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Career" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Career sections" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Achievements", "Targets", "Knowledge base", "Career plan"]);
    expect(within(nav).getByRole("link", { name: "Targets" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Targets" })).toHaveAttribute("href", "/career?section=targets");
    expect(within(nav).getByRole("link", { name: "Achievements" })).toHaveAttribute("href", "/career?section=achievements");
    expect(within(nav).getByRole("link", { name: "Career plan" })).toHaveAttribute("href", "/career?section=plan");
    expect(screen.getByText("Section body")).toBeInTheDocument();
  });
});

describe("AchievementsSection", () => {
  it("shows its count and the empty state when the library is new", () => {
    render(<AchievementsSection achievements={[]} />);
    expect(screen.getByRole("heading", { name: "Achievements (0)" })).toBeInTheDocument();
    expect(screen.getByText(/No achievements yet\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add achievement" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Search achievements" })).toBeInTheDocument();
  });

  it("never shows an AI-imported achievement as verified", () => {
    render(<AchievementsSection achievements={[importedAchievement]} />);
    expect(screen.getByRole("heading", { name: "Achievements (1)" })).toBeInTheDocument();
    expect(screen.getByText("Imported (unverified)")).toBeInTheDocument();
    // "Verified" appears once, as the filter chip, never as this row's badge.
    expect(screen.getAllByText("Verified")).toHaveLength(1);
  });
});

describe("TargetsSection", () => {
  it("shows its count and the empty state when there are no targets yet", () => {
    render(<TargetsSection targets={[]} />);
    expect(screen.getByRole("heading", { name: "Targets (0)" })).toBeInTheDocument();
    expect(screen.getByText(/No targets yet\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add target" })).toBeInTheDocument();
  });

  it("marks the primary target with a star badge, first in the list", () => {
    render(<TargetsSection targets={[primaryTarget]} />);
    expect(screen.getByRole("heading", { name: "Targets (1)" })).toBeInTheDocument();
    expect(screen.getByText("Staff Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Primary/)).toBeInTheDocument();
    expect(screen.getByText(/From 90,000 EUR/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make primary" })).not.toBeInTheDocument();
  });
});

describe("KnowledgeSection", () => {
  it("shows its count and the empty state when there are no documents yet", () => {
    render(<KnowledgeSection docs={[]} aiReady={false} />);
    expect(screen.getByRole("heading", { name: "Knowledge base (0)" })).toBeInTheDocument();
    expect(screen.getByText(/No documents yet\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a document" })).toBeInTheDocument();
  });

  it("offers the review button when the AI is configured, and a muted note when it isn't", async () => {
    const { rerender } = render(<KnowledgeSection docs={[reviewedDoc]} aiReady={true} />);
    // The review button is on the expanded row.
    await userEvent.click(screen.getByRole("button", { name: /CV 2026/ }));
    expect(screen.getByRole("button", { name: /^Review( again)?$/ })).toBeInTheDocument();
    rerender(<KnowledgeSection docs={[reviewedDoc]} aiReady={false} />);
    expect(screen.queryByRole("button", { name: /^Review( again)?$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/connect an AI provider in/i)).toBeInTheDocument();
  });
});
