"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PageHeader } from "@/components/page-header";
import { toast, toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toggle } from "@/components/ui/toggle";
import { useJob } from "@/hooks/use-job";
import type { ExternalSourceView } from "@/lib/discovery/external";
import type { Country } from "@/lib/job-search/countries";
import { RunStatus } from "@/generated/prisma/enums";

import { deleteSearchProfile, runProfileNow, setProfileEnabled } from "./actions";
import { ExternalSourcesSection } from "./external-sources";
import { ProfileEditor, type ProfileFormValues } from "./profile-editor";

/** A run's counts, as the discovery job answers them. */
type RunResult = { message: string };

export type DiscoveryProfileView = {
  id: string;
  name: string;
  enabled: boolean;
  /** "JSearch", "Adzuna", or an external source's label. */
  sourceName: string;
  /** The search in a line, e.g. "node.js backend · Berlin, 50 km · via JSearch". */
  search: string;
  /** "Daily", "Every 6 hours", or the cron expression. */
  schedule: string;
  /** When the profile last ran, in the user's time zone. */
  lastRunAt: string | null;
  /** What the last run did, when there was one. */
  lastStats: string | null;
  /** Why it can't run yet: a missing key, the AI provider, an external source. */
  runProblem: string | null;
  /** A run queued or running, to follow. */
  runJobId: string | null;
  /** Every field of the profile, for the editor. */
  draft: ProfileFormValues;
};

export type RunPostingView = {
  id: string;
  title: string;
  company: string;
  url: string;
  stage: string;
  decision: string;
  score: number | null;
  confidence: string;
  reasons: string[];
  rejectedReason: string;
};

export type DiscoveryRunView = {
  id: string;
  profileName: string;
  status: RunStatus;
  step: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  stats: { fetched: number; duplicates: number; deterministicRejected: number; screened: number; shortlisted: number; assessed: number; failed: number; message: string } | null;
  /** "12,345 in · 4,567 out", when the run's stats say what the AI calls used. */
  tokens: string | null;
  /** The postings the run touched, with how far each got and why (master.md Phase 18). */
  postings: RunPostingView[];
};

const STATUS_LABELS: Record<RunStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  DONE: "Done",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

/** How a run's status colours its label: the run row's own words, kept calm. */
function StatusChip({ status }: { status: RunStatus }) {
  const tone =
    status === RunStatus.DONE
      ? "bg-success-surface text-success"
      : status === RunStatus.FAILED
        ? "bg-danger-control text-error-strong"
        : "bg-hover text-muted";
  return <span className={`rounded-control px-2 py-0.5 text-meta font-medium ${tone}`}>{STATUS_LABELS[status]}</span>;
}

/**
 * Discovery (master.md Phase 2): the search profiles, what their runs did,
 * and the external sources they can search. Nothing runs unasked here —
 * Run now queues one run the schedule would also start.
 */
export function DiscoveryScreen({
  profiles,
  runs,
  sources,
  countries,
}: {
  profiles: DiscoveryProfileView[];
  runs: DiscoveryRunView[];
  sources: ExternalSourceView[];
  /** Built on the server, so a browser's ICU can't name countries differently. */
  countries: readonly Country[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string; initial: ProfileFormValues } | { id: null } | null>(null);
  const [deleting, setDeleting] = useState<DiscoveryProfileView | null>(null);

  return (
    <>
      <PageHeader
        title="Discovery"
        description="Search profiles look for postings on a schedule and put them through the pipeline: filters, a cheap screen, then a full assessment. Everything a run did stays on record below."
        actions={
          !editing && (
            <Button onClick={() => setEditing({ id: null })}>New profile</Button>
          )
        }
      />
      <div className="flex flex-col gap-8 px-10 pb-20">
        {editing ? (
          <ProfileEditor
            id={editing.id}
            initial={editing.id === null ? null : editing.initial}
            sources={sources}
            countries={countries}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        ) : (
          <ProfilesSection profiles={profiles} onEdit={setEditing} onDelete={setDeleting} />
        )}

        <RunsSection runs={runs} />
        <ExternalSourcesSection sources={sources} />
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this profile?"
        description="Its schedule stops, and it won't come back. Its runs and the assessments it made stay on record."
        confirmLabel="Delete profile"
        onConfirm={() => {
          if (deleting) void deleteSearchProfile({ id: deleting.id }).then((result) => {
            if (toastResult(result).ok) router.refresh();
          });
          setDeleting(null);
        }}
      />
    </>
  );
}

function ProfilesSection({
  profiles,
  onEdit,
  onDelete,
}: {
  profiles: DiscoveryProfileView[];
  onEdit: (editing: { id: string; initial: ProfileFormValues } | { id: null }) => void;
  onDelete: (profile: DiscoveryProfileView) => void;
}) {
  return (
    <section aria-labelledby="discovery-profiles" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="discovery-profiles" className="font-serif text-section">
          Search profiles
        </h2>
        <p className="text-meta text-muted">{profiles.length === 0 ? "" : `${profiles.length} saved`}</p>
      </div>
      {profiles.length === 0 ? (
        <p className="rounded-card border border-line-card bg-card px-5 py-4 text-sm text-muted">
          No search profiles yet. A profile is a named search with your criteria — titles, keywords, pay, schedule — that runs itself and assesses what it finds.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <ProfileCard profile={profile} onEdit={onEdit} onDelete={onDelete} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One profile: what it searches, when it runs, its last run, and its actions. */
function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: DiscoveryProfileView;
  onEdit: (editing: { id: string; initial: ProfileFormValues } | { id: null }) => void;
  onDelete: (profile: DiscoveryProfileView) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(profile.enabled);
  const [runJobId, setRunJobId] = useState(profile.runJobId);

  const run = useJob<RunResult>(runJobId, 0, (job) => {
    if (job.status !== "DONE" && job.status !== "FAILED") return;
    setRunJobId(null);
    toast(job.status === "DONE" ? (job.result?.message ?? "The run is done.") : (job.error ?? "The run didn't finish."));
    router.refresh();
  });
  const running = Boolean(runJobId) && (!run || run.status === "QUEUED" || run.status === "RUNNING");

  const toggle = (enabled: boolean) => {
    setEnabled(enabled);
    void setProfileEnabled({ id: profile.id, enabled }).then((result) => {
      if (!toastResult(result).ok) setEnabled(!enabled);
      else router.refresh();
    });
  };

  const runNow = () =>
    startTransition(async () => {
      const result = toastResult(await runProfileNow({ id: profile.id }));
      if (result.ok) setRunJobId(result.data.jobId);
    });

  return (
    <Card padding="none" className="flex flex-col gap-3.5 px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-serif text-[20px] leading-tight text-pretty">{profile.name}</h3>
          <p className="text-sm text-ink">{profile.search}</p>
        </div>
        <Toggle label="Enabled" checked={enabled} onCheckedChange={toggle} aria-label={`Run ${profile.name} on its schedule`} />
      </div>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted">Schedule</dt>
          <dd>{profile.schedule}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">Last run</dt>
          <dd>
            {profile.lastRunAt ?? "Not yet"}
            {profile.lastStats && <span className="block text-muted">{profile.lastStats}</span>}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-3.5">
        <Button
          size="sm"
          variant="secondary"
          title={profile.runProblem ?? undefined}
          aria-disabled={running || pending || Boolean(profile.runProblem) || undefined}
          onClick={() => {
            if (profile.runProblem) return toast(profile.runProblem);
            if (!running && !pending) runNow();
          }}
        >
          {running ? "Running…" : "Run now"}
        </Button>
        {running && (
          <span role="status" className="text-meta text-muted">
            {run?.step ?? "Starting the run…"}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2.5">
          <Button size="sm" variant="secondary" onClick={() => onEdit({ id: profile.id, initial: profile.draft })}>
            Edit
          </Button>
          <Button size="sm" variant="danger-text" onClick={() => onDelete(profile)}>
            Delete
          </Button>
        </span>
      </div>
    </Card>
  );
}

function RunsSection({ runs }: { runs: DiscoveryRunView[] }) {
  return (
    <section aria-labelledby="discovery-runs" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="discovery-runs" className="font-serif text-section">
          Runs history
        </h2>
        <p className="text-meta text-muted">{runs.length === 0 ? "" : `${runs.length} on record`}</p>
      </div>
      {runs.length === 0 ? (
        <p className="rounded-card border border-line-card bg-card px-5 py-4 text-sm text-muted">
          No runs yet. Run a profile now, or wait for its schedule; every run keeps what each stage did with each posting.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {runs.map((run) => (
            <li key={run.id}>
              <RunCard run={run} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const NUMBERS = (stats: NonNullable<DiscoveryRunView["stats"]>): string => {
  const parts = [
    `${stats.fetched} ${stats.fetched === 1 ? "posting" : "postings"} found`,
    `${stats.duplicates} seen before`,
    `${stats.deterministicRejected} filtered out`,
    `${stats.screened} screened`,
    `${stats.shortlisted} shortlisted`,
    `${stats.assessed} assessed`,
  ];
  if (stats.failed > 0) parts.push(`${stats.failed} failed`);
  return parts.join(" · ");
};

/** One run: what each stage did, and — opened — what became of every posting it touched. */
function RunCard({ run }: { run: DiscoveryRunView }) {
  const [open, setOpen] = useState(false);
  const active = run.status === RunStatus.QUEUED || run.status === RunStatus.RUNNING;
  return (
    <Card padding="none" className="flex flex-col gap-2.5 px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-field font-medium">{run.profileName}</h3>
        <StatusChip status={run.status} />
      </div>
      <p className="text-meta text-muted">
        {run.startedAt ? `Started ${run.startedAt}` : "Waiting to start"}
        {run.finishedAt && ` · Finished ${run.finishedAt}`}
      </p>
      {run.stats && <p className="text-sm">{NUMBERS(run.stats)}</p>}
      {run.tokens && <p className="text-meta text-muted">AI used {run.tokens}</p>}
      {active && (
        <p role="status" className="text-meta text-muted">
          {run.step ?? "Starting…"}
        </p>
      )}
      {run.error && (
        <p role="alert" className="text-meta text-error">
          {run.error}
        </p>
      )}
      {run.postings.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-2.5">
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="w-fit text-meta text-muted underline underline-offset-2 hover:text-ink">
            {run.postings.length} {run.postings.length === 1 ? "posting" : "postings"} · {open ? "Hide" : "Show"}
          </button>
          {open && (
            <ul className="flex flex-col gap-2.5">
              {run.postings.map((posting) => (
                <PostingRow key={posting.id} posting={posting} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

const DECISION_LABELS: Record<string, string> = {
  STRONG_MATCH: "Strong match",
  POTENTIAL_MATCH: "Potential match",
  WEAK_MATCH: "Weak match",
  REJECT: "Rejected",
  PENDING: "Waiting",
};

const STAGE_LABELS: Record<string, string> = {
  DETERMINISTIC: "Filtered",
  KEYWORD: "Keyword",
  SCREENED: "Screened",
  ASSESSED: "Assessed",
};

/** How far one posting got, with every reason the pipeline wrote down. */
function PostingRow({ posting }: { posting: RunPostingView }) {
  return (
    <li className="rounded-card bg-paper px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {posting.title}
          {posting.company && <span className="font-normal text-muted"> · {posting.company}</span>}
        </p>
        <p className="text-meta text-muted">
          {STAGE_LABELS[posting.stage] ?? posting.stage}
          {posting.score !== null ? ` · ${DECISION_LABELS[posting.decision] ?? posting.decision}, ${posting.score} of 100` : ` · ${DECISION_LABELS[posting.decision] ?? posting.decision}`}
        </p>
      </div>
      {posting.rejectedReason && (
        <p className="mt-1 text-meta text-warning">{posting.rejectedReason}</p>
      )}
      {posting.reasons.length > 0 && (
        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-meta text-muted">
          {posting.reasons.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
      )}
      {posting.url && (
        <a href={posting.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-meta text-ink underline underline-offset-2">
          Open posting <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </li>
  );
}
