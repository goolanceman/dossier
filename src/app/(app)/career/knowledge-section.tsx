"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { toast, toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DocFindings } from "@/lib/ai/task-contracts";
import { docKindSchema, type KnowledgeDocView } from "@/lib/career/knowledge";
import { useJob } from "@/hooks/use-job";

import { removeDoc, reviewDoc, saveDoc } from "./actions";
import type { ReviewKnowledgeDocResult } from "./jobs";
import { DocStatusBadge } from "./status-badge";

// The knowledge base (master.md §1.3): the user's documents as pasted text,
// reviewed into findings and drafted achievements. Reviewing runs as a
// background job; the drafts land as IMPORTED and only the user verifies.

const DOC_KINDS: Record<string, string> = {
  RESUME: "Resume",
  LINKEDIN: "LinkedIn",
  PROJECT: "Project",
  GITHUB: "GitHub",
  NOTES: "Notes",
  CERTIFICATE: "Certificate",
  REVIEW: "Review",
  OTHER: "Other",
};

const FINDING_KINDS: Record<DocFindings["findings"][number]["kind"], string> = {
  MISSING_METRIC: "Missing metric",
  UNCLEAR_RESPONSIBILITY: "Unclear responsibility",
  UNEVIDENCED_TECH: "Unevidenced technology",
  NO_BUSINESS_CONTEXT: "No business context",
  NO_MEASURABLE_OUTCOME: "No measurable outcome",
  DATE_CONFLICT: "Date conflict",
  DUPLICATE: "Duplicate",
  OTHER: "Note",
};

const kindLabel = (kind: string) => DOC_KINDS[kind] ?? kind;

/** The add-document form: pasted text only for now, and honest about it. */
function DocForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<{ name: string; kind: z.output<typeof docKindSchema>; sourceUrl: string; content: string }>({
    name: "",
    kind: "OTHER",
    sourceUrl: "",
    content: "",
  });
  const set = (change: Partial<typeof form>) => setForm((current) => ({ ...current, ...change }));

  const save = async () => {
    if (toastResult(await saveDoc(form)).ok) onDone();
  };

  return (
    <div className="grid grid-cols-2 gap-[18px] rounded-panel border bg-card p-7">
      <h3 className="col-span-2 font-serif text-section">New document</h3>
      <Input className="col-span-2" label="Name" placeholder="CV 2026" value={form.name} onChange={(event) => set({ name: event.target.value })} autoFocus />
      <Select label="Kind" value={form.kind} onChange={(event) => set({ kind: event.target.value as z.output<typeof docKindSchema> })}>
        {Object.entries(DOC_KINDS).map(([kind, label]) => (
          <option key={kind} value={kind}>
            {label}
          </option>
        ))}
      </Select>
      <Input label="Where it's from" placeholder="https://…" hint="Optional." value={form.sourceUrl} onChange={(event) => set({ sourceUrl: event.target.value })} />
      <Textarea
        className="col-span-2"
        label="Text"
        rows={8}
        hint="Paste the document's text here for now; choosing a file arrives later."
        value={form.content}
        onChange={(event) => set({ content: event.target.value })}
      />
      <div className="col-span-2 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" className="bg-input" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={save}>
          Save document
        </Button>
      </div>
    </div>
  );
}

/** What the review noticed about one document, with the quotes it refers to. */
function Findings({ findings }: { findings: DocFindings }) {
  return (
    <div className="flex flex-col gap-3">
      {findings.findings.length === 0 && findings.achievements.length === 0 && <p className="text-control text-muted">The review found nothing to fix.</p>}
      {findings.findings.length > 0 && (
        <ul className="flex flex-col gap-3">
          {findings.findings.map((finding) => (
            <li key={finding.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex w-fit items-center rounded-full bg-track px-2.5 py-0.5 text-meta text-muted">{FINDING_KINDS[finding.kind]}</span>
                {finding.duplicateOf.trim() !== "" && <span className="text-meta text-muted">Might repeat: {finding.duplicateOf}</span>}
              </div>
              <p className="text-control text-ink">{finding.note}</p>
              {finding.quote.trim() !== "" && (
                <blockquote className="border-l-2 border-line-strong pl-3 text-control text-muted">{finding.quote}</blockquote>
              )}
            </li>
          ))}
        </ul>
      )}
      {findings.achievements.length > 0 && (
        <p className="text-control text-muted">
          {findings.achievements.length} draft achievement{findings.achievements.length === 1 ? "" : "s"} in your library, marked Imported (unverified) until you check {findings.achievements.length === 1 ? "it" : "them"}.
        </p>
      )}
    </div>
  );
}

/** The knowledge-base section (master.md §1.3): pasted documents, AI review, findings and drafts. */
export function KnowledgeSection({ docs, aiReady }: { docs: KnowledgeDocView[]; aiReady: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<KnowledgeDocView | null>(null);
  const [reviewing, setReviewing] = useState<{ docId: string; jobId: string } | null>(null);
  // The job's updates come from outside (SSE or polling), so the follow-up goes in its callback: the toast, the refresh, and clearing the line.
  const job = useJob<ReviewKnowledgeDocResult>(reviewing?.jobId ?? null, 0, (update) => {
    if (update.status === "DONE") {
      const done = update.result;
      toast(
        done
          ? `Review finished: ${done.findings} findings and ${done.achievements} draft achievements. The drafts wait in your library as Imported (unverified).`
          : "Review finished.",
      );
      setReviewing(null);
      router.refresh();
    } else if (update.status === "FAILED") {
      toast(update.error ?? "The review didn't finish. Try again.");
      setReviewing(null);
    }
  });

  const startReview = async (doc: KnowledgeDocView) => {
    const result = await reviewDoc({ id: doc.id });
    if (result.ok) setReviewing({ docId: doc.id, jobId: result.data.jobId });
    else toast(result.error);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-serif text-section">
          Knowledge base <span className="text-muted">({docs.length})</span>
        </h2>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add a document
        </Button>
      </div>

      {!aiReady && (
        <p className="rounded-card bg-track px-4 py-3 text-meta text-muted">
          To review a document, connect an AI provider in{" "}
          <Link href="/settings?section=ai" className="underline underline-offset-3">
            Settings
          </Link>
          . You can add documents already; the review reads them once a provider is there.
        </p>
      )}

      {reviewing && (
        <p role="status" className="text-meta text-muted">
          Reviewing a document: {job?.step ?? "starting"}… This can take a little longer on a local model.
        </p>
      )}

      {adding && <DocForm onDone={() => setAdding(false)} />}

      {docs.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong p-9 text-center text-sm text-muted">
          No documents yet. Paste in a resume, a LinkedIn export or project notes; a review lists what&apos;s missing and drafts achievements for you to check.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map((doc) => {
            const open = openId === doc.id;
            const drafted = doc.achievementIds.length;
            return (
              <div key={doc.id} className="flex flex-col gap-1 rounded-panel border border-line-card bg-card px-6 py-5">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : doc.id)}
                  className="flex flex-col items-start gap-1 text-left focus-visible:-outline-offset-2"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15.5px] font-medium">{doc.name}</span>
                    <DocStatusBadge status={doc.status} />
                    <span className="text-meta text-muted">{kindLabel(doc.kind)}</span>
                  </span>
                  <span className="text-meta text-muted">
                    {doc.status === "REVIEWED"
                      ? doc.findings
                        ? `${doc.findings.findings.length} finding${doc.findings.findings.length === 1 ? "" : "s"}`
                        : "Reviewed"
                      : "Not reviewed yet"}
                    {drafted > 0 && ` · ${drafted} draft achievement${drafted === 1 ? "" : "s"}`}
                  </span>
                </button>
                {doc.sourceUrl.trim() !== "" && (
                  <a href={doc.sourceUrl} className="text-meta text-muted underline underline-offset-3" target="_blank" rel="noreferrer">
                    {doc.sourceUrl}
                  </a>
                )}
                {open && (
                  <div className="mt-3 flex flex-col gap-4 border-t border-line pt-4">
                    {doc.findings ? (
                      <Findings findings={doc.findings} />
                    ) : (
                      <p className="text-control text-muted">
                        {doc.status === "REVIEWED" ? "The review found nothing to fix." : "Not reviewed yet."}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {aiReady && (
                        <Button size="sm" disabled={reviewing !== null} onClick={() => startReview(doc)}>
                          {doc.status === "REVIEWED" ? "Review again" : "Review"}
                        </Button>
                      )}
                      <Button variant="danger-text" size="sm" onClick={() => setConfirming(doc)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Delete document?"
        description={
          confirming
            ? `Deletes “${confirming.name}” and its findings for good. Achievements already drafted from it stay in your library.`
            : ""
        }
        confirmLabel="Delete document"
        onConfirm={() => {
          if (confirming) void (async () => {
            if (toastResult(await removeDoc({ id: confirming.id })).ok) router.refresh();
          })();
          setConfirming(null);
        }}
      />
    </div>
  );
}
