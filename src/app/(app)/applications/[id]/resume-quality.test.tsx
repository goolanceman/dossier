import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResumeCritique } from "@/lib/ai/task-contracts";
import type { DocumentData } from "@/lib/application-documents";
import { demoResumeUnits } from "@/lib/demo-profile";
import { BUILT_IN_THEMES } from "@/lib/themes";
import type { JobView } from "@/lib/jobs/runner";

import { startApplyingFindings, startCritiquingResume } from "./actions";
import { ResumeQuality, type ResumeQualityView } from "./resume-quality";

vi.mock("./actions", () => ({
  startCritiquingResume: vi.fn(async () => ({ ok: true, data: "critique-job-1" })),
  startApplyingFindings: vi.fn(async () => ({ ok: true, data: "apply-job-1" })),
}));
// Jobs report whatever the test says, as the real hook would.
const jobs = vi.hoisted(() => ({ listeners: new Map<string, (job: unknown) => void>() }));
vi.mock("@/hooks/use-job", async () => {
  const { useEffect, useState } = await import("react");
  return {
    useJob: (id: string | null, revision: number, onChange?: (job: unknown) => void) => {
      const [job, setJob] = useState<unknown>(null);
      useEffect(() => {
        if (!id) return;
        void revision;
        jobs.listeners.set(id, (next) => {
          setJob(next);
          onChange?.(next);
        });
        return () => void jobs.listeners.delete(id);
      });
      const view = job as { id: string } | null;
      return view && view.id === id ? job : null;
    },
  };
});
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: unknown) => result }));

function report(job: Partial<JobView>) {
  const view = { id: "apply-job-1", type: "apply-application-findings", status: "RUNNING", step: null, error: null, result: null, ...job };
  act(() => jobs.listeners.get(view.id)?.(view));
}

const finding = (id: string, severity: ResumeCritique["findings"][number]["severity"]): ResumeCritique["findings"][number] => ({
  id,
  category: "CONTENT",
  severity,
  title: `Finding ${id}`,
  currentProblem: "The summary reads generically.",
  recommendation: "Name the domain and the outcome.",
  expectedImpact: "Stronger first screen.",
  effort: "LIGHT",
  evidenceRequired: [],
  relatedJobRequirements: [],
  confidence: "HIGH",
});

const resume: DocumentData = { units: demoResumeUnits(), theme: BUILT_IN_THEMES[0]! };

const quality: ResumeQualityView = {
  documentId: "doc-1",
  writtenWith: "tailor-resume@1",
  evidence: [{ id: "ev-1", achievementId: "a1", unitId: "experience:e1", title: "Ledgerly portal rewrite", status: "VERIFIED" }],
  critique: {
    id: "critique-1",
    appliedDocumentId: null,
    // As findingsByPriority ranks them on the server: worst first.
    findings: [finding("f-critical", "CRITICAL"), finding("f-high", "HIGH"), finding("f-medium", "MEDIUM"), finding("f-low", "LOW")],
  },
  unfinished: { critique: null, apply: null },
};

const onOpenResume = vi.fn();

function renderQuality(overrides: Partial<Parameters<typeof ResumeQuality>[0]> = {}) {
  return render(
    <ResumeQuality
      applicationId="app-1"
      company="Ledgerly"
      resume={resume}
      quality={quality}
      aiReady={true}
      onOpenResume={onOpenResume}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  jobs.listeners.clear();
});

describe("ResumeQuality", () => {
  it("shows the resume's current state, the achievements backing it and the prompt version", () => {
    renderQuality();
    expect(screen.getByText("Your tailored resume now")).toBeInTheDocument();
    expect(screen.getByText("Last written by tailor-resume@1")).toBeInTheDocument();
    expect(screen.getByText(/Backed by: Ledgerly portal rewrite/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Critique again" })).toBeInTheDocument();
  });

  it("lists the findings ranked, with the critical and high ones pre-checked", () => {
    renderQuality();
    const titles = screen.getAllByText(/^Finding f-/).map((element) => element.textContent);
    expect(titles).toEqual(["Finding f-critical", "Finding f-high", "Finding f-medium", "Finding f-low"]);
    expect(screen.getByRole("checkbox", { name: /Finding f-critical/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Finding f-high/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Finding f-medium/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Finding f-low/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Apply 2 findings" })).toBeInTheDocument();
  });

  it("applies the checked findings and shows what was applied and what wasn't", async () => {
    const user = userEvent.setup();
    renderQuality();
    await user.click(screen.getByRole("checkbox", { name: /Finding f-low/ }));
    await user.click(screen.getByRole("button", { name: "Apply 3 findings" }));

    expect(startApplyingFindings).toHaveBeenCalledWith({ id: "app-1", critiqueId: "critique-1", findingIds: ["f-critical", "f-high", "f-low"] });

    report({
      status: "DONE",
      result: {
        applied: [{ findingId: "f-low", unitId: "summary", summary: "Named the domain." }],
        unapplied: [{ findingId: "f-critical", reason: "Applying it would have stated numbers your achievements don't back." }],
      },
    });

    expect(screen.getByText("Applied 1 finding to the tailored resume.")).toBeInTheDocument();
    expect(screen.getByText("Finding f-low:")).toBeInTheDocument();
    expect(screen.getByText("Named the domain.")).toBeInTheDocument();
    expect(screen.getByText("Finding f-critical:")).toBeInTheDocument();
    expect(screen.getByText("Applying it would have stated numbers your achievements don't back.")).toBeInTheDocument();
    expect(screen.getByText(/the version from before is in its history/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Full critique history" })).toHaveAttribute("href", "/resume-intel");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("follows the critique job and refreshes the page when it's done", async () => {
    const user = userEvent.setup();
    renderQuality({ quality: { ...quality, critique: null } });
    await user.click(screen.getByRole("button", { name: "Critique this resume" }));

    expect(startCritiquingResume).toHaveBeenCalledWith({ id: "app-1" });
    report({ id: "critique-job-1", type: "critique-application-resume", status: "RUNNING", step: "Critiquing the resume" });
    expect(screen.getByText("Critiquing your resume: Critiquing the resume…")).toBeInTheDocument();

    report({ id: "critique-job-1", type: "critique-application-resume", status: "DONE", result: { critiqueId: "critique-2" } });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("suits a critique whose findings were already applied", () => {
    renderQuality({ quality: { ...quality, critique: { ...quality.critique!, appliedDocumentId: "doc-1" } } });
    expect(screen.getByText("The findings from this critique have been applied to the resume.")).toBeInTheDocument();
  });

  it("points to the Resume tab when there is no tailored resume", async () => {
    const user = userEvent.setup();
    renderQuality({ resume: null, quality: null });
    expect(screen.getByText(/no tailored resume yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to the Resume tab" }));
    expect(onOpenResume).toHaveBeenCalled();
  });
});
