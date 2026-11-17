"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useJob } from "@/hooks/use-job";
import type { ResumeCritique } from "@/lib/ai/task-contracts";
import type { DocumentData } from "@/lib/application-documents";

import { startApplyingFindings, startCritiquingResume } from "./actions";
import type { ApplyApplicationFindingsResult } from "./resume-quality-jobs";

type Finding = ResumeCritique["findings"][number];

/** One achievement a unit is backed by, as evidenceForDocument reads it. */
export type EvidenceRow = { id: string; achievementId: string; unitId: string; title: string; status: string };

/** What the page read for this tab, as loadResumeQuality gathered it. */
export type ResumeQualityView = {
  /** The tailored resume's Document row, for the evidence map and the apply. */
  documentId: string;
  /** The prompt version that last wrote the units, e.g. "tailor-resume@1"; null when written by hand. */
  writtenWith: string | null;
  evidence: EvidenceRow[];
  /** The newest critique of this tailored resume, its findings already ranked, or null when there isn't one. */
  critique: { id: string; appliedDocumentId: string | null; findings: Finding[] } | null;
  /** Critique and apply jobs still running, to follow again after a reload. */
  unfinished: { critique: string | null; apply: string | null };
};

/** Critical first in red, low last in muted, with the middle steps between (as the Resume intelligence screen shows one). */
const SEVERITY_CLASS: Record<Finding["severity"], string> = {
  CRITICAL: "border-error-strong bg-danger-surface text-error-strong",
  HIGH: "border-error bg-danger-surface text-error",
  MEDIUM: "border-warning-line bg-warning-surface text-warning",
  LOW: "border-line-field bg-paper text-muted",
};

const STATUS_LABEL: Record<string, string> = {
  VERIFIED: "verified",
  USER_CONFIRMED: "confirmed by you",
  IMPORTED: "imported",
  NEEDS_CLARIFICATION: "needs clarification",
};

/**
 * The Resume quality tab (master.md §5): the tailored resume's current state
 * with the achievements backing it, a critique of it the way an ATS, a
 * writer and a recruiter would see it, and the findings applied back into
 * the resume on request. Without a tailored resume it points to the Resume
 * tab, which shows the document itself.
 */
export function ResumeQuality({
  applicationId,
  company,
  resume,
  quality,
  aiReady,
  onOpenResume,
}: {
  applicationId: string;
  company: string;
  resume: DocumentData | null;
  quality: ResumeQualityView | null;
  aiReady: boolean;
  onOpenResume: () => void;
}) {
  const router = useRouter();
  const [critiqueJobId, setCritiqueJobId] = useState(quality?.unfinished.critique ?? null);
  const [applyJobId, setApplyJobId] = useState(quality?.unfinished.apply ?? null);
  // What the last apply did, until the page shows it from the resume itself.
  const [summary, setSummary] = useState<ApplyApplicationFindingsResult | null>(null);
  const [starting, startTransition] = useTransition();

  const critiqueJob = useJob<{ critiqueId: string }>(critiqueJobId, 0, (update) => {
    if (update.status === "DONE") {
      setCritiqueJobId(null);
      // The page reads the saved critique and comes back with its findings.
      router.refresh();
    }
    if (update.status === "FAILED") {
      toast(update.error ?? "That didn't work. Try again.");
      setCritiqueJobId(null);
    }
  });
  const applyJob = useJob<ApplyApplicationFindingsResult>(applyJobId, 0, (update) => {
    if (update.status === "DONE") {
      setApplyJobId(null);
      setSummary(update.result);
      router.refresh();
    }
    if (update.status === "FAILED") {
      toast(update.error ?? "That didn't work. Try again.");
      setApplyJobId(null);
    }
  });

  const critique = quality?.critique ?? null;
  const findings = critique?.findings ?? [];
  // The checked findings, critical and high pre-checked (master.md §5.2); a new
  // critique starts the choice over, and drops the last apply's summary.
  const [checked, setChecked] = useState<string[]>(() => findings.filter(prioritized).map((finding) => finding.id));
  const [seenCritique, setSeenCritique] = useState(critique?.id ?? null);
  if ((critique?.id ?? null) !== seenCritique) {
    setSeenCritique(critique?.id ?? null);
    setChecked(findings.filter(prioritized).map((finding) => finding.id));
    setSummary(null);
  }

  const critiquing = critiqueJobId !== null;
  const applying = applyJobId !== null;

  const startCritique = () =>
    startTransition(async () => {
      const result = await startCritiquingResume({ id: applicationId });
      if (!result.ok) return toast(result.error);
      setCritiqueJobId(result.data);
    });

  const apply = () =>
    startTransition(async () => {
      if (!critique) return;
      const result = await startApplyingFindings({ id: applicationId, critiqueId: critique.id, findingIds: checked });
      if (!result.ok) return toast(result.error);
      setApplyJobId(result.data);
    });

  if (!resume || !quality) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-auto bg-canvas px-10 py-16">
        <Card className="flex w-full max-w-[560px] flex-col items-start gap-3">
          <h2 className="font-serif text-section">Resume quality</h2>
          <p className="text-sm text-pretty text-muted">
            This application has no tailored resume yet. Write one on the Resume tab, then come back here to have it critiqued and improved.
          </p>
          <Button variant="secondary" onClick={onOpenResume}>
            Go to the Resume tab
          </Button>
        </Card>
      </div>
    );
  }

  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  const evidenceByUnit = new Map<string, EvidenceRow[]>();
  for (const row of quality.evidence) {
    const rows = evidenceByUnit.get(row.unitId) ?? [];
    rows.push(row);
    evidenceByUnit.set(row.unitId, rows);
  }
  const backedUnits = quality.evidence.filter((row) => row.unitId !== "").length;

  return (
    <div className="flex flex-1 flex-col items-center gap-4 overflow-auto bg-canvas px-10 pt-11 pb-16">
      <div className="flex w-full max-w-[640px] flex-col gap-4">
        {/* Current state: the units, what backs them, and what last wrote them. */}
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-medium">Your tailored resume now</h2>
            <span className="text-meta text-muted">
              {quality.writtenWith ? `Last written by ${quality.writtenWith}` : "Last written by hand"}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {resume.units.map((unit) => (
              <div key={unit.id} className="flex flex-col gap-1">
                <span className="text-label font-medium text-muted">{unit.label}</span>
                <p className="text-sm whitespace-pre-line text-pretty text-ink">{unit.text}</p>
                {(evidenceByUnit.get(unit.id) ?? []).length > 0 && (
                  <p className="text-label text-muted">
                    Backed by: {(evidenceByUnit.get(unit.id) ?? []).map((row) => evidenceLabel(row)).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-meta text-muted">
            {backedUnits > 0
              ? `${backedUnits} ${backedUnits === 1 ? "part draws" : "parts draw"} on your achievements. Every number on the resume must come from them.`
              : "No achievements are mapped to this resume yet. Numbers it states can't be traced to your evidence."}
          </p>
        </Card>

        {/* The critique and its findings, worst first (master.md §5.2). */}
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-medium">Critique</h2>
            <span className="text-meta text-muted">An internal check, never an employer&rsquo;s screening result</span>
          </div>
          {critiquing ? (
            <p role="status" className="text-sm text-muted">
              Critiquing your resume: {critiqueJob?.step ?? "starting"}…
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={startCritique} disabled={starting || applying}>
                {critique ? "Critique again" : "Critique this resume"}
              </Button>
              {!aiReady && <span className="text-meta text-muted">Needs an AI provider: choose one in Settings → AI provider.</span>}
            </div>
          )}

          {critique && !critiquing && (
            <>
              {critique.appliedDocumentId === quality.documentId && (
                <p className="text-label text-success">The findings from this critique have been applied to the resume.</p>
              )}
              {findings.length === 0 ? (
                <p className="text-sm text-muted">This critique has no findings. Run a new one after you change the resume.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    {findings.map((finding) => (
                      <div key={finding.id} className="flex flex-col gap-1.5 border-line-field border-l-2 pl-3">
                        <Checkbox
                          checked={checked.includes(finding.id)}
                          onChange={(event) =>
                            setChecked((current) =>
                              event.target.checked ? [...current, finding.id] : current.filter((id) => id !== finding.id),
                            )
                          }
                          label={
                            <span className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-xs ${SEVERITY_CLASS[finding.severity]}`}>
                                {finding.severity.toLowerCase()}
                              </span>
                              <span className="font-medium">{finding.title}</span>
                            </span>
                          }
                        />
                        <p className="text-sm text-pretty text-muted">{finding.currentProblem}</p>
                        <p className="text-sm text-pretty text-ink">{finding.recommendation}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={apply} disabled={starting || applying || checked.length === 0}>
                      {applying ? `Applying: ${applyJob?.step ?? "starting"}…` : `Apply ${checked.length} ${checked.length === 1 ? "finding" : "findings"}`}
                    </Button>
                    <span className="text-meta text-muted">The resume keeps its earlier version in its history.</span>
                  </div>
                </>
              )}
            </>
          )}
        </Card>

        {/* What the last apply did, with the way back to the full history. */}
        {summary && !applying && (
          <Card className="flex flex-col gap-3">
            <h2 className="text-[15px] font-medium">
              Applied {summary.applied.length} {summary.applied.length === 1 ? "finding" : "findings"} to the tailored resume.
            </h2>
            {summary.applied.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-pretty text-ink">
                {summary.applied.map((change, index) => (
                  <li key={`${change.findingId}-${index}`}>
                    <span className="text-muted">{findingsById.get(change.findingId)?.title ?? change.findingId}:</span> {change.summary}
                  </li>
                ))}
              </ul>
            )}
            {summary.unapplied.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-label font-medium text-muted">Not applied</span>
                <ul className="flex flex-col gap-1 text-sm text-pretty text-muted">
                  {summary.unapplied.map((entry, index) => (
                    <li key={`${entry.findingId}-${index}`}>
                      <span className="text-ink">{findingsById.get(entry.findingId)?.title ?? entry.findingId}:</span> {entry.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-meta text-muted">
              The resume changed; the version from before is in its history on the Resume tab, if you want it back.
            </p>
            <Link href="/resume-intel" className="text-sm underline underline-offset-2 hover:text-ink">
              Full critique history
            </Link>
          </Card>
        )}

        {company.trim() === "" && (
          <p className="text-meta text-muted">This application has no company on record, so the critique is judged on the role alone.</p>
        )}
      </div>
    </div>
  );
}

/** An achievement as the "Backed by" line names it, with its status when it isn't verified. */
function evidenceLabel(row: EvidenceRow): string {
  const status = STATUS_LABEL[row.status];
  return status === "verified" ? row.title : `${row.title} (${status})`;
}

/** Critical and high findings are the ones worth applying first (master.md §5.2). */
function prioritized(finding: Finding): boolean {
  return finding.severity === "CRITICAL" || finding.severity === "HIGH";
}
