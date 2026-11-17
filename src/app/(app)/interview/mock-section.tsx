"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast, toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleChip } from "@/components/ui/chip";
import { useJob } from "@/hooks/use-job";
import type { MockFeedback } from "@/lib/ai/task-contracts";
import { MockKind } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import type { SessionView } from "@/lib/interview/mock";

import { abandonMock, recordMockTurn, startMock, submitMockAnswer } from "./actions";
import { labelOf, type PlanListItem, type PlanQuestionView } from "./plans-section";

// Mock interviews (master.md §7.5): one question at a time, from the chosen
// plan or, with none chosen, from every plan's questions. Text sessions get
// the interviewer's verdict after each answer, as a background job; the other
// kinds record the answers and leave the grading for later. Nothing here
// invents a voice track: the note says what this pass supports.

const KINDS = [
  { value: MockKind.TEXT, label: "Text" },
  { value: MockKind.TECHNICAL, label: "Technical" },
  { value: MockKind.BEHAVIORAL, label: "Behavioral" },
  { value: MockKind.SYSTEM_DESIGN, label: "System design" },
] as const;

const STATUS_LABEL: Record<string, string> = { IN_PROGRESS: "In progress", COMPLETED: "Completed", ABANDONED: "Abandoned" };

const DIMENSIONS = [
  { key: "technicalAccuracy", label: "Technical accuracy" },
  { key: "structure", label: "Structure" },
  { key: "depth", label: "Depth" },
  { key: "communication", label: "Communication" },
  { key: "evidenceUse", label: "Evidence use" },
] as const;

/** Score bar for one feedback dimension (0 to 100). */
export function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-mono text-meta tabular-nums text-muted">{score}</span>
      </span>
      <div role="img" aria-label={`${label}: ${score} of 100`} className="h-1.5 rounded-full bg-track">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
    </div>
  );
}

/** The interviewer's verdict on the last answer, shown inline. */
function FeedbackPanel({ feedback, onNext }: { feedback: MockFeedback; onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line-card bg-surface p-5">
      <p className="text-meta font-medium">The interviewer&apos;s verdict</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DIMENSIONS.map(({ key, label }) => (
          <ScoreBar key={key} label={label} score={feedback[key]} />
        ))}
      </div>
      {feedback.strengths.length > 0 && (
        <div>
          <p className="text-meta font-medium">Strengths</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {feedback.strengths.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {feedback.improvements.length > 0 && (
        <div>
          <p className="text-meta font-medium">Improvements</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {feedback.improvements.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {feedback.suggestedAnswerPoints.length > 0 && (
        <div>
          <p className="text-meta font-medium">A stronger answer would make these points</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-muted">
            {feedback.suggestedAnswerPoints.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      )}
      <Button onClick={onNext}>Next question</Button>
    </div>
  );
}

/** One question at a time, with the answer box and, for text, the verdict. */
function InterviewView({
  session,
  questions,
  planRole,
  aiReady,
}: {
  session: SessionView;
  questions: PlanQuestionView[];
  planRole: string | null;
  aiReady: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<string | null>(null);
  const [answeredLocally, setAnsweredLocally] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [deeper, setDeeper] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  // A reopened session shows the last graded turn's verdict first, so the
  // user reads it and moves on with "Next question", as after a fresh answer.
  const [lastAnswered, setLastAnswered] = useState<string | null>(
    () => [...session.turns].reverse().find((turn) => turn.feedback !== null)?.question ?? null,
  );

  useJob(jobId, 0, (update) => {
    if (update.status === "QUEUED" || update.status === "RUNNING") return;
    setJobId(null);
    if (update.status === "FAILED") {
      toast(update.error ?? "The verdict didn't come through. Submit the answer again.");
    } else {
      toast("Feedback ready.");
    }
    router.refresh();
  });

  const asked = new Set([...session.turns.map((turn) => turn.question), ...answeredLocally]);
  const nextUnasked = questions.find((question) => !asked.has(question.question))?.question ?? null;
  // null means "follow the bank": the first question not yet asked.
  const effective = current ?? nextUnasked;
  const bankQuestion = questions.find((question) => question.question === effective);
  // The verdict lands on the newest turn, so read backwards.
  const feedback =
    lastAnswered === null ? null : ([...session.turns].reverse().find((turn) => turn.question === lastAnswered && turn.feedback)?.feedback ?? null);
  const end = async () => {
    const result = await abandonMock({ id: session.id });
    if (!result.ok) return void toast(result.error);
    toast("Session ended.");
    router.push("/interview");
  };

  const submit = async () => {
    if (effective === null || answer.trim() === "") return;
    const question = effective;
    // The verdict is an AI job; without a provider the answer is still kept,
    // so practice continues and the screen says no grade is coming.
    if (session.kind === MockKind.TEXT && aiReady) {
      const result = await submitMockAnswer({ sessionId: session.id, question, answer });
      if (!result.ok) return void toast(result.error);
      setAnsweredLocally((kept) => [...kept, question]);
      setLastAnswered(question);
      setAnswer("");
      setDeeper(false);
      setJobId(result.data.jobId);
      return;
    }
    const result = await recordMockTurn({ sessionId: session.id, question, answer });
    if (!result.ok) return void toast(result.error);
    toast(session.kind === MockKind.TEXT ? "Answer noted. The verdict needs an AI provider." : "Answer noted.");
    setAnsweredLocally((kept) => [...kept, question]);
    setAnswer("");
    setDeeper(false);
    router.refresh();
  };

  const askFollowUp = (followUp: string) => {
    setCurrent(followUp);
    setLastAnswered(null);
    setAnswer("");
    setDeeper(false);
  };

  const goNext = () => {
    setLastAnswered(null);
    setCurrent(null);
    setDeeper(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-meta text-muted">
          {KINDS.find((kind) => kind.value === session.kind)?.label ?? session.kind} · {planRole ?? "every plan's questions"} · {session.turns.length}{" "}
          {session.turns.length === 1 ? "answer" : "answers"} so far
          {session.score !== null ? ` · latest score ${session.score}` : ""}
        </p>
        <Button variant="secondary" size="sm" onClick={end}>
          End session
        </Button>
      </div>
      {feedback !== null ? (
        <Card>
          <div className="flex flex-col gap-4">
            <p className="font-serif text-lead">{lastAnswered}</p>
            <FeedbackPanel feedback={feedback} onNext={goNext} />
          </div>
        </Card>
      ) : effective === null ? (
        <Card>
          <p className="text-sm">That is every question the bank has. Ask a follow-up from an earlier answer below, or end the session.</p>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {bankQuestion && (
                <>
                  <span className="rounded-full border border-line-card bg-track px-2 py-0.5 text-meta">{labelOf(bankQuestion.category)}</span>
                  <span className="rounded-full border border-line-card bg-track px-2 py-0.5 text-meta">{labelOf(bankQuestion.difficulty)}</span>
                </>
              )}
            </div>
            <p className="font-serif text-lead">{effective}</p>
            <>
              <Textarea
                label="Your answer"
                hint="Answer as you would out loud; the verdict grades structure, depth and evidence, not spelling."
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={6}
              />
              {bankQuestion && bankQuestion.followUps.length > 0 && (
                <div className="flex flex-col gap-2">
                  <ToggleChip selected={deeper} onClick={() => setDeeper((open) => !open)} aria-expanded={deeper}>
                    Why? Go deeper
                  </ToggleChip>
                  {deeper && (
                    <div className="flex flex-wrap gap-1.5">
                      {bankQuestion.followUps.map((followUp) => (
                        <Button key={followUp} variant="secondary" size="sm" onClick={() => askFollowUp(followUp)}>
                          {followUp}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {jobId !== null ? (
                <p role="status" className="text-meta text-muted">
                  Waiting for the verdict…
                </p>
              ) : (
                <Button onClick={submit} aria-disabled={answer.trim() === "" || undefined}>
                  {session.kind === MockKind.TEXT && !aiReady ? "Submit answer (no grading)" : "Submit answer"}
                </Button>
              )}
            </>
          </div>
        </Card>
      )}
      {session.turns.length > 0 && (
        <Card padding="default">
          <p className="text-meta font-medium">This session so far</p>
          <ol className="mt-3 flex flex-col gap-3">
            {session.turns.map((turn, index) => (
              <li key={`${turn.question}-${index}`} className="border-b border-line pb-3 last:border-none last:pb-0">
                <p className="text-sm font-medium">{turn.question}</p>
                <p className="mt-1 text-sm text-muted">{turn.answer}</p>
                {turn.feedback !== null && (
                  <p className="mt-1 text-meta text-muted">
                    Graded: {Math.round((turn.feedback.technicalAccuracy + turn.feedback.structure + turn.feedback.depth + turn.feedback.communication + turn.feedback.evidenceUse) / 5)} of 100
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

/** The start form: a kind, an optional plan, and the voice note. */
function StartForm({ plans, aiReady }: { plans: PlanListItem[]; aiReady: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<MockKind>(MockKind.TEXT);
  const [planId, setPlanId] = useState("");
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    const result = await startMock({ kind, ...(planId ? { planId } : {}) });
    setStarting(false);
    if (!result.ok) return void toast(result.error);
    router.push(`/interview?mock=${result.data.sessionId}`);
  };

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <SegmentedControl aria-label="Interview kind" options={KINDS.map(({ value, label }) => ({ value, label }))} value={kind} onValueChange={setKind} />
        <Select label="Interview plan (optional)" hint="With no plan, the session asks every plan's questions." value={planId} onChange={(event) => setPlanId(event.target.value)}>
          <option value="">No plan</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.role}
            </option>
          ))}
        </Select>
        {!aiReady && (
          <p className="text-meta text-muted">Grading answers needs an AI provider. Sessions still run, and answers are kept without a verdict.</p>
        )}
        <p className="text-meta text-muted">Voice interviews need a provider that supports it. Text works with every provider, so this pass is text only.</p>
        <Button onClick={start} aria-disabled={starting || undefined}>
          {starting ? "Starting…" : "Start session"}
        </Button>
      </div>
    </Card>
  );
}

/** The mock interview section: the open session, or the start form and the list. */
export function MockSection({
  sessions,
  session,
  questions,
  plans,
  aiReady,
}: {
  sessions: SessionView[];
  session: SessionView | null;
  questions: PlanQuestionView[];
  plans: PlanListItem[];
  aiReady: boolean;
}) {
  const router = useRouter();

  const open = (id: string) => router.push(`/interview?mock=${id}`);

  const abandon = async (id: string) => {
    const result = await abandonMock({ id });
    if (toastResult(result).ok) router.refresh();
  };

  return (
    <section aria-labelledby="mock-heading" className="flex flex-col gap-3">
      <h2 id="mock-heading" className="font-serif text-section">
        Mock interviews
      </h2>
      {session !== null ? (
        <InterviewView
          key={session.id}
          session={session}
          questions={questions}
          aiReady={aiReady}
          planRole={session.planId !== null ? (plans.find((plan) => plan.id === session.planId)?.role ?? null) : null}
        />
      ) : (
        <>
          <StartForm plans={plans} aiReady={aiReady} />
          {sessions.length === 0 ? (
            <p className="text-sm text-muted">No mock interviews yet. Start one and answer one question at a time; text answers get the interviewer&apos;s verdict.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {sessions.map((entry) => (
                <Card key={entry.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium">{KINDS.find((kind) => kind.value === entry.kind)?.label ?? entry.kind}</p>
                    <p className="text-meta text-muted">
                      {STATUS_LABEL[entry.status] ?? entry.status} · started {formatDate(entry.startedAt)}
                      {entry.score !== null ? ` · score ${entry.score}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.status === "IN_PROGRESS" && (
                      <Button variant="danger-text" size="sm" onClick={() => abandon(entry.id)}>
                        Abandon
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => open(entry.id)}>
                      Open
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
