"use client";

import { Card } from "@/components/ui/card";
import { computeReadiness, type ReadinessInput } from "@/lib/interview/readiness";

// The readiness dashboard (master.md §7.6): one number per dimension, counted
// from what actually happened. computeReadiness is the whole formula, and the
// line under the card says so, because the number is only honest when the
// reader knows it is arithmetic over their data, not an AI's opinion.

const DIMENSIONS = [
  { key: "technical", label: "Technical" },
  { key: "behavioral", label: "Behavioral" },
  { key: "systemDesign", label: "System design" },
] as const;

function Bar({ label, score }: { label: string; score: number }) {
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

/** The readiness numbers and the counts behind them, next to the verdict. */
export function ReadinessSection({ input }: { input: ReadinessInput }) {
  const readiness = computeReadiness(input);
  return (
    <section aria-labelledby="readiness-heading" className="flex flex-col gap-3">
      <h2 id="readiness-heading" className="font-serif text-section">
        Readiness
      </h2>
      <Card>
        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <div className="flex items-baseline gap-2">
            <span aria-label={`Overall readiness: ${readiness.overall} of 100`} className="font-serif text-[44px] leading-none tabular-nums">
              {readiness.overall}
            </span>
            <span className="text-meta text-muted">of 100</span>
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-sm">{readiness.verdict}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {DIMENSIONS.map(({ key, label }) => (
                <Bar key={key} label={label} score={readiness[key]} />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-1 border-t border-line pt-4 text-meta text-muted">
          <p>
            {readiness.preparedQuestions} of {readiness.totalQuestions} questions prepared · {readiness.completedSessions} completed mock sessions ·{" "}
            {input.storyCount} STAR {input.storyCount === 1 ? "story" : "stories"} · {input.unansweredGaps} open gap{" "}
            {input.unansweredGaps === 1 ? "question" : "questions"}
          </p>
          <p>
            Counted from your data, not an AI opinion: a dimension is the share of its questions you marked prepared (a dimension with no questions shows 0),
            each passing mock session adds 5 points up to 15, and each open gap question subtracts 2 up to 10.
          </p>
        </div>
      </Card>
    </section>
  );
}
