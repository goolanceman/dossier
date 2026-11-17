"use client";

import { Eye, ListChecks, PenLine, ScanEye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { toast, toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useJob } from "@/hooks/use-job";
import { retry } from "@/lib/jobs/actions";
import { messages } from "@/lib/messages";

import { JobProgress, jobStep } from "../new/job-progress";
import { deleteCritique, openCritique, runCritique } from "./actions";
import type { CritiqueResumeResult } from "./jobs";
import { CRITIQUE_STEPS } from "./view";
import type { CritiqueSummary, CritiqueView } from "./view";

type Finding = CritiqueView["findings"][number];

/** What each kind of reader looks for; the icon says it at a glance. */
const CATEGORY_ICONS: Record<Finding["category"], typeof Eye> = { CONTENT: ListChecks, ATS: ScanEye, WRITING: PenLine, RECRUITER: Eye };
const CATEGORY_LABELS: Record<Finding["category"], string> = { CONTENT: "Content", ATS: "ATS", WRITING: "Writing", RECRUITER: "Recruiter" };

/** Critical first in red, low last in muted, with the middle steps between. */
const SEVERITY_CLASS: Record<Finding["severity"], string> = {
  CRITICAL: "border-error-strong bg-danger-surface text-error-strong",
  HIGH: "border-error bg-danger-surface text-error",
  MEDIUM: "border-warning-line bg-warning-surface text-warning",
  LOW: "border-line-field bg-paper text-muted",
};

const EFFORT_LABELS: Record<Finding["effort"], string> = { LIGHT: "light effort", MEDIUM: "medium effort", HEAVY: "heavy effort" };

/** "1.2 MB" or "480 KB", for the file once it's chosen. */
function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Resume intelligence (master.md §5.1–5.2): upload or paste a resume, have it
 * critiqued the way an ATS, a writer and a recruiter would see it, and keep
 * the critiques so improvements can be worked through oldest problem first.
 * The score is labelled an internal diagnostic estimate, never an employer
 * screening result.
 */
export function ResumeIntel({
  aiReady,
  initialJobId,
  critiques,
  targets,
}: {
  aiReady: boolean;
  initialJobId: string | null;
  critiques: CritiqueSummary[];
  targets: { id: string; title: string; summary: string }[];
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState(initialJobId);
  const [revision, setRevision] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [targetId, setTargetId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [opened, setOpened] = useState<CritiqueView | null>(null);
  const [deleting, setDeleting] = useState<CritiqueSummary | null>(null);
  const job = useJob<CritiqueResumeResult>(jobId, revision, (update) => {
    if (update.status === "DONE" && update.result?.critiqueId) void show(update.result.critiqueId);
  });
  const fileId = useId();
  const pasteId = useId();

  // Opens a stored critique; the new one from a finished job arrives here too.
  async function show(id: string) {
    const result = await openCritique({ id });
    if (!result.ok) return toast(result.error);
    setOpened(result.data);
    router.refresh();
  }

  const follow = (id: string | null) => {
    setJobId(id);
    router.replace(id ? `/resume-intel?job=${id}` : "/resume-intel");
  };

  async function run() {
    if (file) {
      setUploading(true);
      try {
        const query = new URLSearchParams({ fileName: file.name.slice(0, 200) });
        if (targetId) query.set("targetId", targetId);
        const response = await fetch(`/resume-intel/upload?${query}`, {
          method: "POST",
          body: file,
          headers: { "content-type": file.type || "application/octet-stream" },
        });
        const body = (await response.json().catch(() => null)) as { jobId?: string; error?: string } | null;
        if (!response.ok || !body?.jobId) return toast(body?.error ?? messages.unexpected);
        follow(body.jobId);
      } catch {
        toast(messages.offline);
      } finally {
        setUploading(false);
      }
      return;
    }
    if (!pasted.trim()) return toast("Choose a file or paste your resume's text first.");
    const result = await runCritique({ content: pasted, targetId });
    if (result.ok) follow(result.data.jobId);
    else toast(result.error);
  }

  async function remove() {
    if (!deleting) return;
    const gone = deleting;
    setDeleting(null);
    const result = toastResult(await deleteCritique({ id: gone.id }));
    if (result.ok) {
      if (opened?.id === gone.id) setOpened(null);
      router.refresh();
    }
  }

  const running = Boolean(jobId) && (!job || (job.status !== "DONE" && job.status !== "FAILED"));
  const failed = job?.status === "FAILED" ? job.error : null;

  return (
    <>
      <PageHeader
        title="Resume intelligence"
        description="See your resume the way an ATS, a writer and a recruiter would each read it: what to fix first, with the effort each fix takes. Every score here is an internal diagnostic estimate, never a result an employer produced."
      />
      <div className="flex max-w-[816px] flex-col gap-6 px-10 pb-20">
        {running ? (
          <JobProgress
            title="Critiquing your resume…"
            steps={CRITIQUE_STEPS}
            current={jobStep(CRITIQUE_STEPS, job)}
            error={failed}
            onRetry={() => void retry({ id: jobId! }).then((result) => toastResult(result).ok && setRevision((count) => count + 1))}
            onBack={() => follow(null)}
            backLabel="← Choose another resume"
          />
        ) : (
          <Card className="flex flex-col items-start gap-5">
            {!aiReady && (
              <p role="note" className="rounded-card bg-warning-surface px-4 py-3 text-meta text-warning">
                No AI provider is set up yet, so nothing can critique the resume.{" "}
                <Link href="/settings?section=ai" className="font-medium text-warning underline underline-offset-2">
                  Choose one in Settings → AI provider
                </Link>
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor={fileId} className="text-label text-muted">
                Your resume, as PDF, Word (.docx), Markdown or text
              </label>
              <input
                id={fileId}
                type="file"
                accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPasted("");
                }}
                className="text-sm file:mr-3 file:rounded-control file:border file:border-line-control file:bg-input file:px-3 file:py-2 file:text-sm file:text-ink hover:file:border-line-strong"
              />
              {file && (
                <p className="text-meta text-muted">
                  {file.name} · {formatSize(file.size)}
                </p>
              )}
            </div>
            <div className="flex w-full flex-col gap-2">
              <label htmlFor={pasteId} className="text-label text-muted">
                Or paste the resume&apos;s text
              </label>
              <Textarea
                id={pasteId}
                value={pasted}
                onChange={(event) => {
                  setPasted(event.target.value);
                  setFile(null);
                }}
                rows={6}
                placeholder="Paste your resume here, or choose a file above."
              />
            </div>
            <Select
              label="Critique against"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              hint="Optional: the findings then name what that role asks for."
              className="w-full max-w-sm"
            >
              <option value="">No target: a general critique</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.title}
                </option>
              ))}
            </Select>
            {aiReady ? (
              <Button
                aria-disabled={(!file && !pasted.trim()) || uploading || undefined}
                onClick={() => void (uploading || file || pasted.trim() ? run() : undefined)}
              >
                {uploading ? "Reading the file…" : "Run critique"}
              </Button>
            ) : (
              <p className="text-meta text-muted">Run critique becomes available once an AI provider is set up.</p>
            )}
          </Card>
        )}

        {opened && <CritiqueReport critique={opened} />}

        <section aria-labelledby="earlier-critiques" className="flex flex-col gap-3">
          <h2 id="earlier-critiques" className="font-serif text-section">
            Earlier critiques
          </h2>
          {critiques.length === 0 ? (
            <p className="text-sm text-muted">No critiques yet. Run one above and it will be kept here.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {critiques.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 rounded-card border border-line-card bg-surface px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entry.fileName || "Base resume"}</p>
                    <p className="text-meta text-muted tabular-nums">
                      {entry.date}
                      {entry.score !== null ? ` · internal estimate ${entry.score}/100` : ""}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => void show(entry.id)}>
                    Open
                  </Button>
                  <Button variant="danger-text" size="sm" onClick={() => setDeleting(entry)}>
                    Delete…
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this critique?"
        description="The findings and the resume text kept with it are gone for good."
        confirmLabel="Delete critique"
        onConfirm={() => void remove()}
      />
    </>
  );
}

/** A finished critique: the overall estimate, the improvements and what an ATS would stumble on. */
function CritiqueReport({ critique }: { critique: CritiqueView }) {
  return (
    <Card aria-label="Critique results" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 tabIndex={-1} className="font-serif text-section">
          Critique of {critique.fileName || "your base resume"}
        </h2>
        <p className="text-meta text-muted tabular-nums">{critique.date}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-card bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span role="img" aria-label={`Internal diagnostic estimate: ${critique.overall.score} of 100`} className="font-mono text-3xl tabular-nums">
            {critique.overall.score}
          </span>
          <span className="rounded-full border border-line-field bg-input px-3 py-1 text-meta">
            ATS readiness: {critique.overall.atsReadiness.toLowerCase()}
          </span>
        </div>
        <p className="text-meta text-muted">This score is an internal diagnostic estimate, not an employer screening result.</p>
        <p className="text-sm text-pretty">{critique.overall.summary}</p>
      </div>

      <section className="flex flex-col gap-3 border-t border-line pt-5">
        <h3 className="text-[15px] font-medium">What to improve, most important first</h3>
        <ol aria-label="Improvements by priority" className="flex flex-col gap-3">
          {critique.findings.map((finding) => (
            <FindingItem key={finding.id} finding={finding} />
          ))}
        </ol>
      </section>

      {critique.keywordCoverage.length > 0 && <ListSection title="Keyword coverage" items={critique.keywordCoverage} />}
      {critique.formattingIssues.length > 0 && <ListSection title="What an ATS would stumble on" items={critique.formattingIssues} />}
    </Card>
  );
}

/** One finding, collapsed to its headline; the details open underneath. */
function FindingItem({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(true);
  const Icon = CATEGORY_ICONS[finding.category];
  return (
    <li className="rounded-card border border-line-card bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Icon size={16} aria-hidden="true" className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 text-sm font-medium">
          {finding.title}
          <span className="ml-2 text-xs font-normal text-muted">{CATEGORY_LABELS[finding.category]}</span>
        </span>
        <span className={`flex-none rounded-full border px-2 py-0.5 text-xs ${SEVERITY_CLASS[finding.severity]}`}>
          {finding.severity.toLowerCase()}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-4 text-sm">
          <Field label="The problem">
            <p>{finding.currentProblem}</p>
          </Field>
          <Field label="What to do">
            <p>{finding.recommendation}</p>
          </Field>
          <Field label="What fixing it would change">
            <p>{finding.expectedImpact}</p>
          </Field>
          <p className="text-meta text-muted">{EFFORT_LABELS[finding.effort]}</p>
          {finding.evidenceRequired.length > 0 && (
            <Field label="Evidence you'll need">
              <ul className="list-disc pl-5">
                {finding.evidenceRequired.map((evidence) => (
                  <li key={evidence}>{evidence}</li>
                ))}
              </ul>
              <Link href="/career" className="text-sm underline underline-offset-2 hover:text-ink">
                Add this evidence to your library
              </Link>
            </Field>
          )}
          {finding.relatedJobRequirements.length > 0 && (
            <Field label="Job requirements this touches">
              <ul className="list-disc pl-5">
                {finding.relatedJobRequirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </Field>
          )}
        </div>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-label text-muted">{label}</p>
      {children}
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-5">
      <h3 className="text-[15px] font-medium">{title}</h3>
      <ul className="list-disc pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
