"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast, toastResult } from "@/components/toast";
import { ScoreBadge } from "@/components/score-badge";
import { PageHeader } from "@/components/page-header";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useJob } from "@/hooks/use-job";
import type { CompanyResearchResult, RequirementMatch } from "@/lib/ai/task-contracts";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/cn";
import { postedAgo } from "@/lib/job-search/search";
import type { JobCritique } from "@/lib/job-intel/critique";
import type { WeightKey, Weights } from "@/lib/job-intel/weights";
import type { SalaryStatus } from "@/generated/prisma/client";

import {
  answerGapQuestion,
  assessPosting,
  createLearningPlan,
  critiquePosting,
  generateGapQuestions,
  markGapQuestionUnknown,
  overrideAssessment,
  prepareInterview,
  researchCompany,
  researchSalary,
  saveGapQuestionForLater,
  skipGapQuestion,
} from "./actions";

// Job Intelligence (master.md §14 "Job Intelligence"): one posting's whole
// picture — compatibility, requirement mapping with evidence, salary,
// critique, gap questions, next steps and company research. The AI work runs
// as background jobs (jobs.ts); this screen starts them and follows their
// steps. Every figure and fact is shown with the kind it is: an estimate
// never presents itself as confirmed (master.md §4), and research without
// sources is shown as interpretation (master.md Phase 9).

export type AssessmentView = {
  /** STRONG_MATCH, POTENTIAL_MATCH, WEAK_MATCH or REJECT. */
  decision: string;
  score: number | null;
  /** HIGH, MEDIUM or LOW. */
  confidence: string;
  dimensions: Record<WeightKey, number> | null;
  requirements: RequirementMatch[];
  /** Why the assessment landed here, stage by stage. */
  reasons: string[];
  /** Set when a mandatory rejection rule forced REJECT. */
  rejectedReason: string;
  /** The user's recorded override of the decision, with their reasoning. */
  userOverride: string;
};

export type SalaryEstimateView = {
  status: SalaryStatus;
  /** Where the figure came from, in the one wording master.md §4 allows (estimateLabel's). */
  statusLabel: string;
  minimum: number | null;
  median: number | null;
  maximum: number | null;
  currency: string;
  basis: string;
  confidence: string;
  sourceCount: number;
  sources: { url: string; label: string; retrievedAt: string }[];
  methodology: string;
};

export type CompanyResearchView = {
  research: CompanyResearchResult | null;
  sources: { url: string; label: string; retrievedAt: string }[];
  researchedWith: string;
};

export type GapQuestionView = {
  id: string;
  question: string;
  reason: string;
  relatedRequirement: string;
  questionType: string;
  priority: string;
};

export type IntelligenceScreenProps = {
  posting: {
    id: string;
    title: string;
    company: string;
    place: string;
    remote: boolean | null;
    salary: string;
    postedAt: string | null;
    url: string;
    via: string;
  };
  today: string;
  /** An AI provider is set up, so the AI buttons show. */
  aiReady: boolean;
  weights: Weights;
  assessment: AssessmentView | null;
  critique: JobCritique | null;
  estimate: SalaryEstimateView | null;
  gaps: GapQuestionView[];
  companyResearch: CompanyResearchView | null;
  /** Achievement titles by id, from the evidence library, for the requirement mapping. */
  evidence: Record<string, string>;
  hasInterviewPlan: boolean;
  hasLearningPlan: boolean;
};

type JobKind = "assess" | "salary" | "critique" | "gaps" | "interview" | "learning" | "company";

const JOB_DONE: Record<JobKind, string> = {
  assess: "Assessment ready.",
  salary: "Salary research done.",
  critique: "Critique saved.",
  gaps: "Gap questions are ready below.",
  interview: "Interview prep is ready.",
  learning: "Learning plan saved.",
  company: "Company research done.",
};

/** What a section shows instead of its AI button when no provider is set up. */
function AiNote() {
  return (
    <p className="text-meta text-muted">
      This needs an AI provider. <Link href="/settings" className="underline underline-offset-2">Set one up in Settings</Link>.
    </p>
  );
}

/** "HIGH" → "High". */
function labelOf(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

const HOSTLESS = /^https?:\/\//i;

/** "glassdoor.com" from a source's URL, or the URL itself when it isn't one. */
function hostOf(url: string): string {
  if (!HOSTLESS.test(url)) return url;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-GB")}`;
}

const BASIS_LABEL: Record<string, string> = { ANNUAL: "a year", MONTHLY: "a month", HOURLY: "an hour" };

/** The range in words, or null when there is no figure to show. */
function salaryRange(estimate: SalaryEstimateView): string | null {
  if (estimate.status === "UNAVAILABLE") return null;
  const { minimum, maximum, currency } = estimate;
  if (minimum !== null && maximum !== null) return minimum === maximum ? money(minimum, currency) : `${money(minimum, currency)} – ${money(maximum, currency)}`;
  return [minimum !== null ? `from ${money(minimum, currency)}` : null, maximum !== null ? `up to ${money(maximum, currency)}` : null].filter(Boolean).join(" ") || null;
}

/** The section headings, shared so every card reads the same. */
function SectionHeading({ id, children }: { id: string; children: string }) {
  return <h2 id={id} className="font-serif text-section">{children}</h2>;
}

function Status({ tone, children }: { tone: string; children: string }) {
  return <span className={cn("inline-flex items-center rounded-full border border-line-card bg-track px-2 py-0.5 text-meta", tone)}>{children}</span>;
}

/**
 * The screen. One job runs at a time (local models do best with one), so the
 * running job's step shows in its own section and the other AI buttons wait.
 */
export function IntelligenceScreen(props: IntelligenceScreenProps) {
  const router = useRouter();
  const { posting } = props;
  const [job, setJob] = useState<{ id: string; kind: JobKind } | null>(null);
  const watching = useJob(job?.id ?? null, 0, (update) => {
    if (update.status === "QUEUED" || update.status === "RUNNING") return;
    const kind = job?.kind;
    setJob(null);
    if (update.status === "FAILED") return void toast(update.error ?? "The AI couldn't finish this. Try again.");
    toast(kind ? JOB_DONE[kind] : "Done.");
    router.refresh();
  });
  const busy = job !== null && (!watching || watching.status === "QUEUED" || watching.status === "RUNNING");
  const step = busy ? watching?.step ?? null : null;
  const refresh = () => router.refresh();

  const start = (kind: JobKind) => {
    if (busy) return;
    const run = async () => {
      const result = await JOB_ACTIONS[kind]({ postingId: posting.id });
      if (!result.ok) return void toast(result.error);
      setJob({ id: result.data.jobId, kind });
    };
    void run();
  };

  const ago = postedAgo(posting.postedAt, new Date(props.today));
  const meta = [posting.company, posting.place, posting.remote === true ? "Remote" : "", posting.salary, ago && `Posted ${ago.toLowerCase()}`, posting.via && `via ${posting.via}`].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title={posting.title.trim() || "Untitled posting"}
        description={meta.join(" · ") || "The job's intelligence, from its posting and your profile."}
        actions={
          posting.url ? (
            <a href={posting.url} target="_blank" rel="noopener noreferrer" className={buttonClassName("secondary")}>
              Open posting<span aria-hidden>↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null
        }
      />
      <div className="flex flex-col gap-6 px-10 pb-20">
        {props.assessment === null && <AssessCallout aiReady={props.aiReady} busy={busy} step={job?.kind === "assess" ? step : null} onStart={() => start("assess")} />}
        {props.assessment && (
          <CompatibilitySection
            postingId={posting.id}
            assessment={props.assessment}
            weights={props.weights}
            busy={busy}
            step={job?.kind === "assess" ? step : null}
            onAssess={() => start("assess")}
            onRefresh={refresh}
          />
        )}
        {props.assessment && <RequirementsSection assessment={props.assessment} evidence={props.evidence} />}
        <SalarySection estimate={props.estimate} posting={posting} aiReady={props.aiReady} busy={busy} step={job?.kind === "salary" ? step : null} onResearch={() => start("salary")} />
        {props.assessment && <CritiqueSection critique={props.critique} aiReady={props.aiReady} busy={busy} step={job?.kind === "critique" ? step : null} onGenerate={() => start("critique")} />}
        <GapQuestionsSection gaps={props.gaps} aiReady={props.aiReady} busy={busy} step={job?.kind === "gaps" ? step : null} onGenerate={() => start("gaps")} />
        {props.assessment && (
          <NextStepsSection
            aiReady={props.aiReady}
            busy={busy}
            interviewStep={job?.kind === "interview" ? step : null}
            learningStep={job?.kind === "learning" ? step : null}
            hasInterviewPlan={props.hasInterviewPlan}
            hasLearningPlan={props.hasLearningPlan}
            onPrepare={() => start("interview")}
            onPlan={() => start("learning")}
          />
        )}
        <CompanySection research={props.companyResearch} aiReady={props.aiReady} busy={busy} step={job?.kind === "company" ? step : null} onResearch={() => start("company")} />
      </div>
    </>
  );
}

const JOB_ACTIONS = {
  assess: assessPosting,
  salary: researchSalary,
  critique: critiquePosting,
  gaps: generateGapQuestions,
  interview: prepareInterview,
  learning: createLearningPlan,
  company: researchCompany,
} as const;

function StepLine({ step }: { step: string | null }) {
  return (
    <p role="status" className="text-meta text-muted">
      {step ?? "Starting…"}
    </p>
  );
}

/** What the page shows before the deep assessment exists (master.md §3.2). */
function AssessCallout({ aiReady, busy, step, onStart }: { aiReady: boolean; busy: boolean; step: string | null; onStart: () => void }) {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <SectionHeading id="assess-callout">Not assessed yet</SectionHeading>
        <p className="text-sm text-muted">
          Run the assessment to see how well this posting fits you: requirement by requirement, with evidence from your library, a compatibility score, a
          recommendation and a critique.
        </p>
        {step !== null ? (
          <StepLine step={step} />
        ) : (
          aiReady && (
            <Button aria-disabled={busy || undefined} onClick={busy ? undefined : onStart}>
              {busy ? "Working…" : "Assess this posting"}
            </Button>
          )
        )}
        {!aiReady && <AiNote />}
      </div>
    </Card>
  );
}

const DECISION_VIEW: Record<string, { label: string; tone: string }> = {
  STRONG_MATCH: { label: "Strong match", tone: "text-success" },
  POTENTIAL_MATCH: { label: "Potential match", tone: "text-ink" },
  WEAK_MATCH: { label: "Weak match", tone: "text-muted" },
  REJECT: { label: "Reject", tone: "text-error" },
};

const DIMENSION_LABELS: Record<WeightKey, string> = {
  technicalSkills: "Technical skills",
  relevantExperience: "Relevant experience",
  responsibilities: "Responsibilities",
  architecture: "Architecture and system design",
  seniority: "Seniority",
  domain: "Domain experience",
  locationRemote: "Location and remote eligibility",
  employmentConditions: "Salary and employment conditions",
};

const WEIGHT_KEYS = Object.keys(DIMENSION_LABELS) as WeightKey[];

/** One dimension's score against its configured weight (master.md §3.2). */
function DimensionBar({ label, weight, score }: { label: string; weight: number; score: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span>
          {label} <span className="text-meta text-muted">{weight}%</span>
        </span>
        <span className="font-mono text-meta tabular-nums text-muted">{score}</span>
      </span>
      <div role="img" aria-label={`${label}: ${score} of 100`} className="h-1.5 rounded-full bg-track">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
    </div>
  );
}

/** The user's override (master.md §3.4): a reason is required, and kept. */
function OverrideControl({ postingId, override, onSaved }: { postingId: string; override: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (override !== "") {
    return (
      <p className="text-sm">
        You overrode this: <span className="text-muted">{override}</span>
      </p>
    );
  }
  if (!open) {
    return (
      <Button variant="text" size="sm" onClick={() => setOpen(true)}>
        Disagree
      </Button>
    );
  }
  const save = async () => {
    setSaving(true);
    const result = toastResult(await overrideAssessment({ postingId, reasoning: reason }));
    setSaving(false);
    if (result.ok) onSaved();
  };
  return (
    <div className="flex flex-col gap-2">
      <Textarea label="Why do you disagree?" hint="Kept with the assessment, so the record says why." value={reason} onChange={(event) => setReason(event.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" aria-disabled={saving || reason.trim() === "" || undefined} onClick={reason.trim() === "" ? undefined : () => void save()}>
          {saving ? "Saving…" : "Save override"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Compatibility (master.md §3.2): the score, the decision, the dimensions with their weights. */
function CompatibilitySection({
  postingId,
  assessment,
  weights,
  busy,
  step,
  onAssess,
  onRefresh,
}: {
  postingId: string;
  assessment: AssessmentView;
  weights: Weights;
  busy: boolean;
  step: string | null;
  onAssess: () => void;
  onRefresh: () => void;
}) {
  const decision = DECISION_VIEW[assessment.decision] ?? { label: labelOf(assessment.decision), tone: "text-muted" };
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="compatibility">Compatibility</SectionHeading>
          <Button variant="secondary" size="sm" aria-disabled={busy || undefined} onClick={busy ? undefined : onAssess}>
            Assess again
          </Button>
        </div>
        {step !== null ? (
          <StepLine step={step} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              {assessment.score !== null && <ScoreBadge score={assessment.score} />}
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">
                  {decision.label}
                  {assessment.score !== null && ` · ${assessment.score} of 100`}
                </p>
                <p className="text-meta text-muted">Confidence: {labelOf(assessment.confidence) || "—"}</p>
              </div>
            </div>
            {assessment.rejectedReason.trim() !== "" && (
              <p role="note" className="rounded-card border border-warning-line bg-warning-surface px-4 py-3 text-sm text-warning">
                <span className="font-medium">Mandatory rejection.</span> {assessment.rejectedReason} No score can overrule this; you can still disagree below.
              </p>
            )}
            {assessment.dimensions && (
              <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {WEIGHT_KEYS.map((key) => (
                  <DimensionBar key={key} label={DIMENSION_LABELS[key]} weight={weights[key]} score={assessment.dimensions![key]} />
                ))}
              </div>
            )}
            {assessment.reasons.length > 0 && (
              <div>
                <h3 className="text-label font-medium">Why it landed here</h3>
                <ul aria-label="Why the assessment landed here" className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-muted">
                  {assessment.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
            <OverrideControl postingId={postingId} override={assessment.userOverride} onSaved={onRefresh} />
          </>
        )}
      </div>
    </Card>
  );
}

const IMPORTANCE_LABELS: Record<RequirementMatch["importance"], string> = { REQUIRED: "Required", PREFERRED: "Preferred" };

const STATUS_VIEW: Record<RequirementMatch["status"], { label: string; tone: string }> = {
  STRONG_EVIDENCE: { label: "Strong evidence", tone: "text-success" },
  PARTIAL_EVIDENCE: { label: "Partial evidence", tone: "text-ink" },
  TRANSFERABLE: { label: "Transferable", tone: "text-ink" },
  MISSING_EVIDENCE: { label: "Missing evidence", tone: "text-warning" },
  CONFIRMED_GAP: { label: "Confirmed gap", tone: "text-error" },
  NOT_APPLICABLE: { label: "Not applicable", tone: "text-muted" },
};

/** Requirement mapping (master.md §3.3): every requirement with its evidence and the posting's own words. */
function RequirementsSection({ assessment, evidence }: { assessment: AssessmentView; evidence: Record<string, string> }) {
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <SectionHeading id="requirements">Requirement mapping</SectionHeading>
        {assessment.requirements.length === 0 ? (
          <p className="text-sm text-muted">The assessment found no requirements to map.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-meta text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">Requirement</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Importance</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Your evidence</th>
                  <th scope="col" className="py-2 pr-4 font-medium">From the posting</th>
                  <th scope="col" className="py-2 font-medium">Assessment</th>
                </tr>
              </thead>
              <tbody>
                {assessment.requirements.map((requirement, index) => {
                  const status = STATUS_VIEW[requirement.status] ?? { label: labelOf(requirement.status), tone: "text-muted" };
                  return (
                    <tr key={index} className="border-b border-line align-top last:border-b-0">
                      <td className="py-3 pr-4 font-medium text-pretty">{requirement.requirement}</td>
                      <td className="py-3 pr-4 text-muted">{IMPORTANCE_LABELS[requirement.importance]}</td>
                      <td className="py-3 pr-4">
                        <Status tone={status.tone}>{status.label}</Status>
                      </td>
                      <td className="py-3 pr-4">
                        {requirement.evidenceIds.length === 0 ? (
                          <span className="text-muted">None in your library</span>
                        ) : (
                          <ul className="flex list-disc flex-col gap-0.5 pl-4">
                            {requirement.evidenceIds.map((id) => (
                              <li key={id}>
                                <Link href="/career" className="underline underline-offset-2 hover:text-ink">
                                  {evidence[id] ?? id}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {requirement.jdQuotes.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {requirement.jdQuotes.map((quote, quoteIndex) => (
                              <blockquote key={quoteIndex} className="border-l-2 border-line pl-3 text-muted">
                                “{quote}”
                              </blockquote>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="py-3 text-pretty">
                        <span className="flex flex-col gap-1">
                          {requirement.explanation}
                          <span className="text-meta text-muted">Confidence: {labelOf(requirement.confidence) || "—"}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-meta text-muted">Transferable experience is not direct experience: the evidence column says what your library actually backs.</p>
      </div>
    </Card>
  );
}

/** Salary intelligence (master.md Phase 4): the figure always shown with its kind. */
function SalarySection({
  estimate,
  posting,
  aiReady,
  busy,
  step,
  onResearch,
}: {
  estimate: SalaryEstimateView | null;
  posting: IntelligenceScreenProps["posting"];
  aiReady: boolean;
  busy: boolean;
  step: string | null;
  onResearch: () => void;
}) {
  const tone =
    estimate === null || estimate.status === "UNAVAILABLE"
      ? "text-muted"
      : estimate.status === "ESTIMATED"
        ? "text-warning"
        : "text-success";
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <SectionHeading id="salary">Salary</SectionHeading>
        {step !== null ? (
          <StepLine step={step} />
        ) : estimate === null ? (
          <>
            <p className="text-sm text-muted">
              {posting.salary.trim() !== ""
                ? `The ad states: ${posting.salary}. Run the assessment first; it keeps the stated figure on record.`
                : "The ad states no pay, and nothing has been researched yet."}
            </p>
            {posting.salary.trim() === "" &&
              (aiReady ? (
                <div className="flex flex-col items-start gap-2">
                  <Button aria-disabled={busy || undefined} onClick={busy ? undefined : onResearch}>
                    {busy ? "Working…" : "Research salary"}
                  </Button>
                  <p className="text-meta text-muted">No salary source is configured yet, so the research reads the posting alone and says Unavailable when it finds nothing.</p>
                </div>
              ) : (
                <AiNote />
              ))}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-medium tabular-nums">{salaryRange(estimate) ?? "Unavailable"}</span>
              <Status tone={tone}>{estimate.statusLabel}</Status>
              {estimate.status !== "UNAVAILABLE" && estimate.basis && <span className="text-meta text-muted">{BASIS_LABEL[estimate.basis] ?? "a year"}</span>}
            </div>
            {estimate.median !== null && estimate.minimum !== estimate.median && estimate.maximum !== estimate.median && (
              <p className="text-sm text-muted">Median {money(estimate.median, estimate.currency)}</p>
            )}
            <p className="text-meta text-muted">Confidence: {labelOf(estimate.confidence) || "—"}</p>
            {estimate.status === "UNAVAILABLE" && (
              <p className="text-meta text-muted">No trustworthy figure exists. Nothing is invented to fill the gap.</p>
            )}
            {estimate.methodology.trim() !== "" && <p className="text-sm text-muted">{estimate.methodology}</p>}
            {estimate.sources.length > 0 && (
              <div>
                <h3 className="text-label font-medium">Sources</h3>
                <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
                  {estimate.sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
                        {source.label || hostOf(source.url)}
                      </a>{" "}
                      <span className="text-meta text-muted">
                        ({hostOf(source.url)})
                        {source.retrievedAt.trim() !== "" && ` · retrieved ${source.retrievedAt}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

const RECOMMENDATION_VIEW: Record<JobCritique["recommendation"], { label: string; tone: string }> = {
  APPLY: { label: "Apply", tone: "text-success" },
  APPLY_AFTER_PREPARATION: { label: "Apply after preparation", tone: "text-ink" },
  SAVE_FOR_LATER: { label: "Save for later", tone: "text-muted" },
  REJECT: { label: "Reject", tone: "text-error" },
};

/** One labelled paragraph of the critique, left out when there's nothing to say. */
function CritiqueField({ title, text }: { title: string; text: string | string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-label font-medium">{title}</h3>
      {Array.isArray(text) ? (
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-muted">
          {text.map((entry, index) => (
            <li key={index}>{entry}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{text}</p>
      )}
    </div>
  );
}

/** The critique (master.md §3.4), with its recommendation and the user's override beside it. */
function CritiqueSection({ critique, aiReady, busy, step, onGenerate }: { critique: JobCritique | null; aiReady: boolean; busy: boolean; step: string | null; onGenerate: () => void }) {
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="critique">Critique</SectionHeading>
          {critique === null && step === null && (aiReady ? (
            <Button size="sm" aria-disabled={busy || undefined} onClick={busy ? undefined : onGenerate}>
              {busy ? "Working…" : "Generate critique"}
            </Button>
          ) : (
            <AiNote />
          ))}
        </div>
        {step !== null ? (
          <StepLine step={step} />
        ) : critique === null ? (
          <p className="text-sm text-muted">No critique yet. It is worked out from the assessment: what attracts, what you&apos;re missing, and where the interviews will be hard.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Status tone={RECOMMENDATION_VIEW[critique.recommendation]?.tone ?? "text-muted"}>{RECOMMENDATION_VIEW[critique.recommendation]?.label ?? labelOf(critique.recommendation)}</Status>
            </div>
            {critique.attractive.length > 0 && <CritiqueField title="What makes the position attractive" text={critique.attractive} />}
            {critique.suitable.length > 0 && <CritiqueField title="Why you're suitable" text={critique.suitable} />}
            {critique.lacking.length > 0 && <CritiqueField title="What you're lacking" text={critique.lacking} />}
            {critique.hiddenRequirements.length > 0 && <CritiqueField title="Hidden requirements" text={critique.hiddenRequirements} />}
            {critique.interviewDifficulty.trim() !== "" && <CritiqueField title="Interview difficulty" text={critique.interviewDifficulty} />}
            {critique.seniorityMismatch.trim() !== "" && <CritiqueField title="Seniority mismatch" text={critique.seniorityMismatch} />}
            {critique.concerns.length > 0 && <CritiqueField title="Concerns" text={critique.concerns} />}
            {critique.progression.trim() !== "" && <CritiqueField title="Career progression" text={critique.progression} />}
            {critique.salaryCompetitiveness.trim() !== "" && <CritiqueField title="Salary competitiveness" text={critique.salaryCompetitiveness} />}
            {critique.reasoning.trim() !== "" && <CritiqueField title="Reasoning" text={critique.reasoning} />}
          </>
        )}
      </div>
    </Card>
  );
}

const PRIORITY_LABELS: Record<string, string> = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const QUESTION_TYPE_LABELS: Record<string, string> = {
  TECHNICAL: "Technical",
  ACHIEVEMENT: "Achievement",
  METRICS: "Metrics",
  LEADERSHIP: "Leadership",
  PROJECT: "Project",
  BUSINESS: "Business impact",
  CLARIFICATION: "Clarification",
};

/** One open question, with the four ways through it (master.md Phase 6). */
function GapQuestionRow({ question, onDone }: { question: GapQuestionView; onDone: () => void }) {
  const [answer, setAnswer] = useState("");
  const [working, setWorking] = useState(false);

  const act = (run: () => Promise<ActionResult<null>>) => {
    void (async () => {
      setWorking(true);
      const result = await run();
      setWorking(false);
      if (result.ok) onDone();
    })();
  };

  return (
    <li className="flex flex-col gap-2.5 rounded-card border border-line-card px-4 py-4">
      <p className="text-sm font-medium text-pretty">{question.question}</p>
      {question.reason.trim() !== "" && <p className="text-meta text-muted">{question.reason}</p>}
      <p className="text-meta text-muted">
        {[question.relatedRequirement && `On: ${question.relatedRequirement}`, PRIORITY_LABELS[question.priority] ?? labelOf(question.priority), QUESTION_TYPE_LABELS[question.questionType] ?? labelOf(question.questionType)]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <Textarea aria-label={`Your answer to: ${question.question}`} placeholder="Your answer, in your own words" value={answer} onChange={(event) => setAnswer(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" aria-disabled={working || answer.trim() === "" || undefined} onClick={answer.trim() === "" ? undefined : () => void act(() => answerGapQuestion({ id: question.id, answer }))}>
          Answer
        </Button>
        <Button variant="secondary" size="sm" aria-disabled={working || undefined} onClick={() => void act(() => skipGapQuestion({ id: question.id }))}>
          Skip
        </Button>
        <Button variant="secondary" size="sm" aria-disabled={working || undefined} onClick={() => void act(() => markGapQuestionUnknown({ id: question.id }))}>
          Unknown
        </Button>
        <Button variant="secondary" size="sm" aria-disabled={working || undefined} onClick={() => void act(() => saveGapQuestionForLater({ id: question.id }))}>
          Save for later
        </Button>
      </div>
    </li>
  );
}

/** Gap questions (master.md Phase 6): what only the candidate knows. */
function GapQuestionsSection({ gaps, aiReady, busy, step, onGenerate }: { gaps: GapQuestionView[]; aiReady: boolean; busy: boolean; step: string | null; onGenerate: () => void }) {
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="gaps">Questions only you can answer</SectionHeading>
          {gaps.length === 0 && step === null && (aiReady ? (
            <Button size="sm" aria-disabled={busy || undefined} onClick={busy ? undefined : onGenerate}>
              {busy ? "Working…" : "Generate gap questions"}
            </Button>
          ) : (
            <AiNote />
          ))}
        </div>
        {step !== null ? (
          <StepLine step={step} />
        ) : gaps.length === 0 ? (
          <p className="text-sm text-muted">
            No open questions. Generating asks what the posting needs and your profile doesn&apos;t show; answered ones become evidence in your library.
          </p>
        ) : (
          <ul aria-label="Open gap questions" className="flex flex-col gap-3">
            {gaps.map((question) => (
              <GapQuestionRow key={question.id} question={question} onDone={() => toast("Done. The question has moved on.")} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/** Next steps (master.md Phases 7–8): thin triggers; the Interview hub does the deep work. */
function NextStepsSection({
  aiReady,
  busy,
  interviewStep,
  learningStep,
  hasInterviewPlan,
  hasLearningPlan,
  onPrepare,
  onPlan,
}: {
  aiReady: boolean;
  busy: boolean;
  interviewStep: string | null;
  learningStep: string | null;
  hasInterviewPlan: boolean;
  hasLearningPlan: boolean;
  onPrepare: () => void;
  onPlan: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <SectionHeading id="next-steps">Next steps</SectionHeading>
        {!aiReady ? (
          <AiNote />
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-col items-start gap-1">
              <Button variant="secondary" aria-disabled={busy || undefined} onClick={busy ? undefined : onPrepare}>
                {interviewStep !== null ? "Preparing…" : hasInterviewPlan ? "Prepare interview again" : "Prepare interview"}
              </Button>
              {interviewStep !== null ? <StepLine step={interviewStep} /> : (
                <p className="text-meta text-muted">
                  Predicted questions land in <Link href="/interview" className="underline underline-offset-2">Interview prep</Link>.
                </p>
              )}
            </div>
            <div className="flex flex-col items-start gap-1">
              <Button variant="secondary" aria-disabled={busy || undefined} onClick={busy ? undefined : onPlan}>
                {learningStep !== null ? "Planning…" : hasLearningPlan ? "Make a new learning plan" : "Make a learning plan"}
              </Button>
              {learningStep !== null ? <StepLine step={learningStep} /> : <p className="text-meta text-muted">Built from the gaps the assessment found.</p>}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** A fact with its kind shown: confirmed with a source, or the model's reading (master.md Phase 9). */
function CompanyFact({ fact }: { fact: CompanyResearchResult["products"][number] }) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="text-sm text-pretty">{fact.fact}</span>
      {fact.kind === "CONFIRMED" && fact.sourceUrl.trim() !== "" ? (
        <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-meta text-success underline underline-offset-2">
          Confirmed · {hostOf(fact.sourceUrl)}
        </a>
      ) : (
        <span className="text-meta text-muted">Interpretation — check this yourself</span>
      )}
    </li>
  );
}

/** A fact list with its kind shown on every fact: confirmed with a source, or the model's reading (master.md Phase 9). */
function FactField({ title, facts }: { title: string; facts: CompanyResearchResult["products"] }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-label font-medium">{title}</h3>
      <ul className="flex list-disc flex-col gap-1.5 pl-5">
        {facts.map((fact, index) => (
          <CompanyFact key={index} fact={fact} />
        ))}
      </ul>
    </div>
  );
}

/** Company research (master.md Phase 9): confirmed facts and interpretations, never mixed up. */
function CompanySection({ research, aiReady, busy, step, onResearch }: { research: CompanyResearchView | null; aiReady: boolean; busy: boolean; step: string | null; onResearch: () => void }) {
  const found = research?.research ?? null;
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="company">Company research</SectionHeading>
          {found === null && step === null && (aiReady ? (
            <Button size="sm" aria-disabled={busy || undefined} onClick={busy ? undefined : onResearch}>
              {busy ? "Working…" : "Research company"}
            </Button>
          ) : (
            <AiNote />
          ))}
        </div>
        {step !== null ? (
          <StepLine step={step} />
        ) : found === null ? (
          <p className="text-sm text-muted">No research yet. What it finds is marked as confirmed, with its source, or as interpretation to check.</p>
        ) : (
          <>
            {research!.sources.length === 0 && (
              <p role="note" className="rounded-card bg-warning-surface px-4 py-3 text-meta text-warning">
                No sources were available to research from, so everything here is interpretation, marked as such.
              </p>
            )}
            {found.overview.trim() !== "" && <p className="text-sm text-pretty">{found.overview}</p>}
            {found.products.length > 0 && <FactField title="Products" facts={found.products} />}
            {found.techStack.length > 0 && (
              <div className="flex flex-col gap-1">
                <h3 className="text-label font-medium">Technology stack</h3>
                <ul className="flex flex-wrap gap-1.5" aria-label="Technology stack">
                  {found.techStack.map((tech) => (
                    <li key={tech} className="rounded-full border border-line-field bg-input px-2.5 py-0.5 text-meta">
                      {tech}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {found.engineeringCulture.length > 0 && <FactField title="Engineering culture" facts={found.engineeringCulture} />}
            {found.recentDevelopments.length > 0 && <FactField title="Recent developments" facts={found.recentDevelopments} />}
            {found.funding.trim() !== "" && <CritiqueField title="Funding" text={found.funding} />}
            {found.companySize.trim() !== "" && <CritiqueField title="Company size" text={found.companySize} />}
            {found.locations.length > 0 && <CritiqueField title="Locations" text={found.locations.join(", ")} />}
            {found.remotePolicy.trim() !== "" && <CritiqueField title="Remote policy" text={found.remotePolicy} />}
            {found.whyCompany.trim() !== "" && <CritiqueField title="Why this company" text={found.whyCompany} />}
            {found.whyRole.trim() !== "" && <CritiqueField title="Why this role" text={found.whyRole} />}
            {found.checklist.length > 0 && <CritiqueField title="Before the interview" text={found.checklist} />}
            {found.questionsToAsk.length > 0 && <CritiqueField title="Questions to ask them" text={found.questionsToAsk} />}
          </>
        )}
      </div>
    </Card>
  );
}
