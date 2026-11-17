"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ToggleChip } from "@/components/ui/chip";
import { useJob } from "@/hooks/use-job";
import { formatDate } from "@/lib/dates";

import { generatePlan, removePlan, setQuestionPrepared, suggestStories } from "./actions";

// Interview plans (master.md §7.1–7.3): the predicted questions for a role,
// grouped and filtered, each with what a strong answer covers and the
// evidence it can draw on. The questions are predictions and the screen says
// so wherever they are generated; nothing here claims to know the company's
// actual questions.

export type PlanListItem = {
  id: string;
  role: string;
  rounds: { name: string; focus: string }[];
  questionCount: number;
  preparedCount: number;
  createdAt: Date;
};

export type PlanQuestionView = {
  id: string;
  category: string;
  difficulty: string;
  question: string;
  whyAsked: string;
  expectedTopics: string[];
  answerStructure: string[];
  evidenceIds: string[];
  followUps: string[];
  commonMistakes: string[];
  resources: string[];
  prepared: boolean;
};

export type PlanDetailView = {
  id: string;
  role: string;
  rounds: { name: string; focus: string }[];
  preparedWith: string;
  createdAt: Date;
  questions: PlanQuestionView[];
};

export type PostingPicker = { id: string; title: string; company: string };

/** "RECRUITER" → "Recruiter", "SYSTEM_DESIGN" → "System design". */
export const labelOf = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");

/** The disclaimer master.md §7.3 requires wherever predicted questions are generated or shown. */
export const PREDICTED_DISCLAIMER = "These are predicted, representative questions, not the company's actual interview questions.";

/** What a section shows instead of its AI button when no provider is set up. */
export function AiNote() {
  return (
    <p className="text-meta text-muted">
      This needs an AI provider. <Link href="/settings" className="underline underline-offset-2">Set one up in Settings</Link>.
    </p>
  );
}

/** The generate-plan form: a role, an optional posting for the JD, and the disclaimer. */
function GenerateForm({ postings, aiReady }: { postings: PostingPicker[]; aiReady: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [postingId, setPostingId] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const watching = useJob<{ planId: string }>(jobId, 0, (update) => {
    if (update.status === "QUEUED" || update.status === "RUNNING") return;
    setJobId(null);
    if (update.status === "FAILED") return void toast(update.error ?? "The plan didn't finish. Try again.");
    toast("Interview plan ready.");
    if (update.result?.planId) router.push(`/interview?plan=${update.result.planId}`);
    else router.refresh();
  });

  const generate = async () => {
    const result = await generatePlan({ role, ...(postingId ? { postingId } : {}) });
    if (!result.ok) return void toast(result.error);
    setJobId(result.data.jobId);
  };

  if (!aiReady) return <AiNote />;
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <h3 className="font-serif text-section">Generate a plan</h3>
        <Input label="Role" placeholder="Senior Backend Engineer" value={role} onChange={(event) => setRole(event.target.value)} />
        <Select label="Job posting (optional)" hint="Its description becomes the JD the questions are prepared from." value={postingId} onChange={(event) => setPostingId(event.target.value)}>
          <option value="">No posting</option>
          {postings.map((posting) => (
            <option key={posting.id} value={posting.id}>
              {[posting.title, posting.company].filter(Boolean).join(" at ")}
            </option>
          ))}
        </Select>
        <p className="text-meta text-muted">{PREDICTED_DISCLAIMER}</p>
        {jobId !== null ? (
          <p role="status" className="text-meta text-muted">
            {watching?.step ?? "Starting…"}
          </p>
        ) : (
          <Button onClick={generate} aria-disabled={role.trim() === "" || undefined}>
            Generate plan
          </Button>
        )}
      </div>
    </Card>
  );
}

/** One predicted question, with everything a prepared answer needs. */
function QuestionCard({ question, evidence, onPrepared }: { question: PlanQuestionView; evidence: Record<string, string>; onPrepared: () => void }) {
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<{ id: string; title: string }[] | null>(null);
  const titles = question.evidenceIds.map((id) => evidence[id]).filter(Boolean);

  const suggest = async () => {
    setSuggesting(true);
    const result = await suggestStories({ questionId: question.id });
    setSuggesting(false);
    if (!result.ok) return void toast(result.error);
    setSuggestions(result.data);
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-line-card bg-track px-2 py-0.5 text-meta">{labelOf(question.category)}</span>
        <span className="rounded-full border border-line-card bg-track px-2 py-0.5 text-meta">{labelOf(question.difficulty)}</span>
        {question.prepared && <span className="rounded-full bg-selected px-2 py-0.5 text-meta text-primary-text">Prepared</span>}
      </div>
      <p className="font-medium">{question.question}</p>
      {question.whyAsked.trim() !== "" && <p className="text-sm text-muted">Why asked: {question.whyAsked}</p>}
      {question.expectedTopics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {question.expectedTopics.map((topic) => (
            <span key={topic} className="rounded-full border border-line-field bg-input px-2 py-0.5 text-meta">
              {topic}
            </span>
          ))}
        </div>
      )}
      {question.answerStructure.length > 0 && (
        <div>
          <p className="text-meta font-medium">Answer structure</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">
            {question.answerStructure.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {question.followUps.length > 0 && (
        <div>
          <p className="text-meta font-medium">Likely follow-ups</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
            {question.followUps.map((followUp) => (
              <li key={followUp}>{followUp}</li>
            ))}
          </ul>
        </div>
      )}
      {question.commonMistakes.length > 0 && (
        <div>
          <p className="text-meta font-medium">Common mistakes</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
            {question.commonMistakes.map((mistake) => (
              <li key={mistake}>{mistake}</li>
            ))}
          </ul>
        </div>
      )}
      {titles.length > 0 && (
        <p className="text-sm text-muted">Evidence to draw on: {titles.join(", ")}</p>
      )}
      {question.evidenceIds.length > 0 && titles.length === 0 && (
        <p className="text-sm text-muted">The achievements this answer could draw on are no longer in your library.</p>
      )}
      {question.resources.length > 0 && (
        <div>
          <p className="text-meta font-medium">Topics to read up on</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {question.resources.map((resource) => (
              <span key={resource} className="rounded-full border border-line-field bg-input px-2 py-0.5 text-meta">
                {resource}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <ToggleChip selected={question.prepared} check onClick={() => onPrepared()}>
          Prepared
        </ToggleChip>
        <Button variant="text" size="sm" onClick={suggest} aria-disabled={suggesting || undefined}>
          {suggesting ? "Looking…" : "Suggest stories"}
        </Button>
        {suggestions !== null && (
          <span className="text-meta text-muted">
            {suggestions.length === 0
              ? "No story matches this question's topics yet."
              : suggestions.map((story, index) => (
                  <span key={story.id}>
                    {index > 0 && ", "}
                    <Link href="/interview#star-stories" className="underline underline-offset-2">
                      {story.title}
                    </Link>
                  </span>
                ))}
          </span>
        )}
      </div>
    </Card>
  );
}

/** The plan detail: filters, then every question card. */
function PlanDetail({ plan, evidence }: { plan: PlanDetailView; evidence: Record<string, string> }) {
  const router = useRouter();
  const [category, setCategory] = useState("All");
  const [difficulty, setDifficulty] = useState("All");
  const [deleting, setDeleting] = useState(false);
  // "All" first, then the plan's own values in the order it asks them.
  const categories = ["All", ...new Set(plan.questions.map((question) => question.category))];
  const difficulties = ["All", ...new Set(plan.questions.map((question) => question.difficulty))];
  const visible = plan.questions.filter(
    (question) => (category === "All" || question.category === category) && (difficulty === "All" || question.difficulty === difficulty),
  );
  const prepared = plan.questions.filter((question) => question.prepared).length;

  const toggle = async (questionId: string, prepared: boolean) => {
    const result = await setQuestionPrepared({ questionId, prepared });
    if (!result.ok) toast(result.error);
    else router.refresh();
  };

  const remove = async () => {
    const result = await removePlan({ id: plan.id });
    if (!result.ok) return void toast(result.error);
    toast("Plan deleted.");
    router.push("/interview");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-serif text-section">{plan.role}</h3>
          <p className="text-meta text-muted">
            {plan.rounds.map((round) => round.name).join(" · ")} · {prepared} of {plan.questions.length} prepared · generated {formatDate(plan.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push("/interview")}>
            All plans
          </Button>
          <Button variant="danger-outline" size="sm" onClick={() => setDeleting(true)}>
            Delete plan
          </Button>
        </div>
      </div>
      <p className="text-meta text-muted">{PREDICTED_DISCLAIMER}</p>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((value) => (
          <ToggleChip key={value} selected={category === value} onClick={() => setCategory(value)}>
            {value === "All" ? "All categories" : labelOf(value)}
          </ToggleChip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {difficulties.map((value) => (
          <ToggleChip key={value} selected={difficulty === value} onClick={() => setDifficulty(value)}>
            {value === "All" ? "All difficulties" : labelOf(value)}
          </ToggleChip>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted">No questions match these filters.</p>
      ) : (
        visible.map((question) => <QuestionCard key={question.id} question={question} evidence={evidence} onPrepared={() => toggle(question.id, !question.prepared)} />)
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this plan?"
        description="Its questions go with it. STAR stories and mock sessions you kept stay."
        confirmLabel="Delete plan"
        onConfirm={remove}
      />
    </div>
  );
}

/** The plans list, or the opened plan. */
export function PlansSection({
  plans,
  plan,
  postings,
  aiReady,
  evidence,
}: {
  plans: PlanListItem[];
  plan: PlanDetailView | null;
  postings: PostingPicker[];
  aiReady: boolean;
  evidence: Record<string, string>;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);

  return (
    <section aria-labelledby="plans-heading" className="flex flex-col gap-3">
      <div id="plans-heading" className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-section">Interview plans</h2>
        {plan === null && aiReady && (
          <Button size="sm" onClick={() => setGenerating((open) => !open)} aria-expanded={generating}>
            {generating ? "Close" : "Generate plan"}
          </Button>
        )}
      </div>
      {plan !== null ? (
        <PlanDetail plan={plan} evidence={evidence} />
      ) : (
        <>
          {!aiReady && <AiNote />}
          {generating && <GenerateForm postings={postings} aiReady={aiReady} />}
          {plans.length === 0 ? (
            <p className="text-sm text-muted">No interview plans yet. Generate one to see the questions a role is likely to bring.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {plans.map((entry) => (
                <Card key={entry.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium">{entry.role}</p>
                    <p className="text-meta text-muted">
                      {entry.rounds.map((round) => round.name).join(" · ")} · {entry.questionCount} {entry.questionCount === 1 ? "question" : "questions"} ·{" "}
                      {entry.preparedCount} prepared · {formatDate(entry.createdAt)}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => router.push(`/interview?plan=${entry.id}`)}>
                    Open
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
