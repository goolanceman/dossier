"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useJob } from "@/hooks/use-job";
import { LearningStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";

import { generateLearningPlan, removePlan, setTopicStatus } from "./actions";
import { AiNote, labelOf } from "./plans-section";

// Learning plans (master.md Phase 8): the topics to learn for a goal, in
// order, with the practice and the interview questions each one carries.
// The plan proposes; the user moves the topics along and the progress counts
// come from those statuses, not from an estimate.

export type LearningStatusCount = { completed: number; total: number };

export type LearningListItem = {
  id: string;
  goal: string;
  topicCount: number;
  createdAt: Date;
  progress: LearningStatusCount;
};

export type LearningTopicView = {
  id: string;
  title: string;
  sequence: number;
  status: LearningStatus;
  effortHours: number;
  prerequisites: string[];
  exercises: string[];
  miniProjects: string[];
  interviewQuestions: string[];
  resources: string[];
};

export type LearningDetailView = {
  id: string;
  goal: string;
  plannedWith: string;
  createdAt: Date;
  topics: LearningTopicView[];
  progress: LearningStatusCount;
};

export type TargetPicker = { id: string; title: string };

const STATUSES: LearningStatus[] = [
  LearningStatus.NOT_STARTED,
  LearningStatus.LEARNING,
  LearningStatus.PRACTICING,
  LearningStatus.COMPLETED,
  LearningStatus.NEEDS_REVISION,
];

/** The generate form: a goal, and where the gaps come from. */
function GenerateForm({ postings, targets }: { postings: { id: string; title: string; company: string }[]; targets: TargetPicker[] }) {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [postingId, setPostingId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const watching = useJob<{ planId: string }>(jobId, 0, (update) => {
    if (update.status === "QUEUED" || update.status === "RUNNING") return;
    setJobId(null);
    if (update.status === "FAILED") return void toast(update.error ?? "The plan didn't finish. Try again.");
    toast("Learning plan ready.");
    if (update.result?.planId) router.push(`/interview?learning=${update.result.planId}`);
    else router.refresh();
  });

  const generate = async () => {
    const result = await generateLearningPlan({
      goal,
      ...(postingId ? { postingId } : {}),
      ...(targetId ? { targetId } : {}),
    });
    if (!result.ok) return void toast(result.error);
    setJobId(result.data.jobId);
  };

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <h3 className="font-serif text-section">New learning plan</h3>
        <Input
          label="Goal"
          placeholder="Be ready for senior AI backend roles"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
        />
        <Select
          label="Job posting (optional)"
          hint="The plan takes its gaps from the posting's assessment."
          value={postingId}
          onChange={(event) => setPostingId(event.target.value)}
        >
          <option value="">No posting</option>
          {postings.map((posting) => (
            <option key={posting.id} value={posting.id}>
              {[posting.title, posting.company].filter(Boolean).join(" at ")}
            </option>
          ))}
        </Select>
        <Select
          label="Career target (optional)"
          hint="Without a posting, the plan takes the target's keywords."
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
        >
          <option value="">No target</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.title}
            </option>
          ))}
        </Select>
        {jobId !== null ? (
          <p role="status" className="text-meta text-muted">
            {watching?.step ?? "Starting…"}
          </p>
        ) : (
          <Button onClick={generate} aria-disabled={goal.trim() === "" || undefined}>
            Generate plan
          </Button>
        )}
      </div>
    </Card>
  );
}

/** One topic in sequence, with its status control and its practice. */
function TopicCard({ topic }: { topic: LearningTopicView }) {
  const router = useRouter();

  const setStatus = async (status: LearningStatus) => {
    const result = await setTopicStatus({ topicId: topic.id, status });
    if (!result.ok) toast(result.error);
    else router.refresh();
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span aria-hidden className="font-mono text-meta text-muted">
            {topic.sequence + 1}
          </span>
          <p className="font-medium">{topic.title}</p>
        </div>
        <Select aria-label={`Status of ${topic.title}`} value={topic.status} onChange={(event) => setStatus(event.target.value as LearningStatus)} selectClassName="w-44">
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {labelOf(status)}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-meta text-muted">About {topic.effortHours} {topic.effortHours === 1 ? "hour" : "hours"}</p>
      {topic.prerequisites.length > 0 && <p className="text-sm text-muted">Learn first: {topic.prerequisites.join(", ")}</p>}
      {topic.exercises.length > 0 && (
        <div>
          <p className="text-meta font-medium">Exercises</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {topic.exercises.map((exercise) => (
              <li key={exercise}>{exercise}</li>
            ))}
          </ul>
        </div>
      )}
      {topic.miniProjects.length > 0 && (
        <div>
          <p className="text-meta font-medium">Mini-projects</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {topic.miniProjects.map((project) => (
              <li key={project}>{project}</li>
            ))}
          </ul>
        </div>
      )}
      {topic.interviewQuestions.length > 0 && (
        <div>
          <p className="text-meta font-medium">Interview questions to be able to answer</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
            {topic.interviewQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      )}
      {topic.resources.length > 0 && (
        <div>
          <p className="text-meta font-medium">Resources</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {topic.resources.map((resource) => (
              <span key={resource} className="rounded-full border border-line-field bg-input px-2 py-0.5 text-meta">
                {resource}
              </span>
            ))}
          </div>
          <p className="mt-1 text-meta text-muted">Topics to search for, not links: nothing here was verified as a source.</p>
        </div>
      )}
    </Card>
  );
}

/** The learning section: the opened plan, or the list and the generate form. */
export function LearningSection({
  plans,
  plan,
  postings,
  targets,
  aiReady,
}: {
  plans: LearningListItem[];
  plan: LearningDetailView | null;
  postings: { id: string; title: string; company: string }[];
  targets: TargetPicker[];
  aiReady: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (plan === null) return;
    const result = await removePlan({ id: plan.id });
    if (!result.ok) return void toast(result.error);
    toast("Plan deleted.");
    router.push("/interview");
  };

  return (
    <section aria-labelledby="learning-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="learning-heading" className="font-serif text-section">
          Learning plans
        </h2>
        {plan === null && aiReady && (
          <Button size="sm" onClick={() => setGenerating((open) => !open)} aria-expanded={generating}>
            {generating ? "Close" : "New plan"}
          </Button>
        )}
      </div>
      {plan !== null ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="font-serif text-section">{plan.goal}</h3>
              <p className="text-meta text-muted">
                {plan.progress.completed} of {plan.progress.total} topics completed · created {formatDate(plan.createdAt)}
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
          {plan.topics.length === 0 ? (
            <p className="text-sm text-muted">This plan has no topics yet.</p>
          ) : (
            plan.topics.map((topic) => <TopicCard key={topic.id} topic={topic} />)
          )}
          <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete this learning plan?" description="Its topics go with it." confirmLabel="Delete plan" onConfirm={remove} />
        </div>
      ) : (
        <>
          {!aiReady && <AiNote />}
          {generating && aiReady && <GenerateForm postings={postings} targets={targets} />}
          {plans.length === 0 ? (
            <p className="text-sm text-muted">No learning plans yet. Generate one from a goal, a posting&apos;s gaps or a career target.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {plans.map((entry) => (
                <Card key={entry.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium">{entry.goal}</p>
                    <p className="text-meta text-muted">
                      {entry.topicCount} {entry.topicCount === 1 ? "topic" : "topics"} · {entry.progress.completed} completed · {formatDate(entry.createdAt)}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => router.push(`/interview?learning=${entry.id}`)}>
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
