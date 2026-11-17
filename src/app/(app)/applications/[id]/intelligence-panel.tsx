"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * The intelligence artifacts connected to one application (master.md Phase
 * 10), as its page loaded them. A plain view: the page reads the rows and
 * wording, this panel only shows them.
 */
export type IntelligenceView = {
  /** The saved posting it was started from, whose intelligence page holds the job's artifacts; null when made by hand. */
  postingId: string | null;
  /** The posting's assessment: its decision and score, when one was made. */
  assessment: { decision: string; score: number | null } | null;
  /** The salary figure's kind ("Stated in the job ad", …) and the range, when one exists. */
  salary: { label: string; range: string | null } | null;
  /** How many gap questions are waiting for an answer. */
  openGaps: number;
  /** The posting's interview plans, newest first, with how many questions are prepared. */
  interviewPlans: { id: string; role: string; rounds: { name: string; focus: string }[]; questions: number; prepared: number }[];
  /** The posting's learning plans, newest first, with their progress. */
  learningPlans: { id: string; goal: string; completed: number; total: number }[];
  /** Whether company research exists for the company. */
  companyResearched: boolean;
  /** The tailored documents on the application, with the prompt versions that wrote them. */
  documents: { kind: "RESUME" | "COVER_LETTER"; writtenWith: string | null }[];
};

/** The same decision wording and tones as the intelligence page's Compatibility section. */
const DECISION_VIEW: Record<string, { label: string; tone: string }> = {
  STRONG_MATCH: { label: "Strong match", tone: "text-success" },
  POTENTIAL_MATCH: { label: "Potential match", tone: "text-ink" },
  WEAK_MATCH: { label: "Weak match", tone: "text-muted" },
  REJECT: { label: "Reject", tone: "text-error" },
};

/** "STRONG_MATCH" → "Strong match", for a decision the list above doesn't know. */
const labelOf = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");

/** The eight connections master.md Phase 10 counts, for the collapsed summary. */
const KINDS = 8;

const linkClass = "underline underline-offset-2 hover:text-ink";

/**
 * The application's connected intelligence (master.md Phase 10), collapsed by
 * default: one row per kind of artifact, shown only when it exists, with a
 * "not yet" hint and the way to it when it doesn't.
 */
export function IntelligencePanel({ intelligence }: { intelligence: IntelligenceView }) {
  const [open, setOpen] = useState(false);
  const { postingId } = intelligence;
  const decision = intelligence.assessment ? DECISION_VIEW[intelligence.assessment.decision] ?? { label: labelOf(intelligence.assessment.decision), tone: "text-muted" } : null;
  const resume = intelligence.documents.find((document) => document.kind === "RESUME");
  const letter = intelligence.documents.find((document) => document.kind === "COVER_LETTER");
  const connected = [
    intelligence.assessment !== null,
    intelligence.salary !== null,
    intelligence.openGaps > 0,
    intelligence.interviewPlans.length > 0,
    intelligence.learningPlans.length > 0,
    intelligence.companyResearched,
    resume !== undefined,
    letter !== undefined,
  ].filter(Boolean).length;

  return (
    <section aria-label="Intelligence" className="border-t border-line bg-canvas px-10 py-8">
      <Card className="mx-auto w-full max-w-[880px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-section">Intelligence</h2>
          <span className="flex items-center gap-3">
            <span className="text-meta text-muted">{connected === 0 ? "Nothing connected yet" : `${connected} of ${KINDS} connected`}</span>
            {connected > 0 && (
              <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={cn("text-sm", linkClass)}>
                {open ? "Hide" : "Show"}
              </button>
            )}
          </span>
        </div>
        {connected > 0 && open && (
          <div className="flex flex-col pt-3">
            <Row label="Job assessment">
              {intelligence.assessment ? (
                <>
                  <span className={cn("inline-flex items-center rounded-full border border-line-card bg-track px-2 py-0.5 text-meta", decision?.tone)}>{decision?.label}</span>
                  {intelligence.assessment.score !== null && <span className="tabular-nums">{intelligence.assessment.score} of 100</span>}
                  {postingId && (
                    <Link href={`/intelligence/${postingId}#compatibility`} className={linkClass}>
                      Open job intelligence
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <span>Not assessed yet.</span>
                  {postingId && (
                    <Link href={`/intelligence/${postingId}`} className={linkClass}>
                      Open job intelligence
                    </Link>
                  )}
                </>
              )}
            </Row>
            <Row label="Salary">
              {intelligence.salary ? (
                <>
                  <span>{intelligence.salary.label}</span>
                  {intelligence.salary.range && <span className="tabular-nums">{intelligence.salary.range}</span>}
                </>
              ) : (
                <>
                  <span>No salary research yet.</span>
                  {postingId && (
                    <Link href={`/intelligence/${postingId}#salary`} className={linkClass}>
                      Open salary research
                    </Link>
                  )}
                </>
              )}
            </Row>
            <Row label="Gap questions">
              {intelligence.openGaps > 0 ? (
                <>
                  <span>{intelligence.openGaps} open</span>
                  {postingId && (
                    <Link href={`/intelligence/${postingId}#gaps`} className={linkClass}>
                      Answer them
                    </Link>
                  )}
                </>
              ) : (
                <span>No open gap questions.</span>
              )}
            </Row>
            <Row label="Interview preparation">
              {intelligence.interviewPlans.length > 0 ? (
                <span className="flex flex-col items-end gap-1">
                  {intelligence.interviewPlans.map((plan) => (
                    <span key={plan.id} className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
                      <Link href={`/interview?plan=${plan.id}`} className={linkClass}>
                        {plan.role.trim() || "Interview plan"}
                      </Link>
                      <span>
                        {plan.rounds.length} rounds · {plan.prepared} of {plan.questions} questions prepared
                      </span>
                    </span>
                  ))}
                </span>
              ) : (
                <>
                  <span>No interview preparation yet.</span>
                  <Link href="/interview" className={linkClass}>
                    Open interview prep
                  </Link>
                </>
              )}
            </Row>
            <Row label="Learning plan">
              {intelligence.learningPlans.length > 0 ? (
                <span className="flex flex-col items-end gap-1">
                  {intelligence.learningPlans.map((plan) => (
                    <span key={plan.id} className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
                      <Link href={`/interview?learning=${plan.id}`} className={linkClass}>
                        {plan.goal.trim() || "Learning plan"}
                      </Link>
                      <span>
                        {plan.completed} of {plan.total} topics done
                      </span>
                    </span>
                  ))}
                </span>
              ) : (
                <>
                  <span>No learning plan yet.</span>
                  <Link href="/interview" className={linkClass}>
                    Open learning plans
                  </Link>
                </>
              )}
            </Row>
            <Row label="Company research">
              {intelligence.companyResearched ? (
                <>
                  <span>Researched</span>
                  {postingId && (
                    <Link href={`/intelligence/${postingId}#company`} className={linkClass}>
                      Open company research
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <span>Not researched yet.</span>
                  {postingId && (
                    <Link href={`/intelligence/${postingId}#company`} className={linkClass}>
                      Open company research
                    </Link>
                  )}
                </>
              )}
            </Row>
            <Row label="Resume version">
              {resume ? <span>{resume.writtenWith ? `Written with ${resume.writtenWith}` : "Written without AI"}</span> : <span>No tailored resume yet.</span>}
            </Row>
            <Row label="Cover letter">
              {letter ? <span>{letter.writtenWith ? `Written with ${letter.writtenWith}` : "Written without AI"}</span> : <span>No cover letter yet.</span>}
            </Row>
          </div>
        )}
      </Card>
    </section>
  );
}

/** One artifact: its kind on the left, what exists (or the way to it) on the right. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 text-sm text-muted">{children}</div>
    </div>
  );
}
