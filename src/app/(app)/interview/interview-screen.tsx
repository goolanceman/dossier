"use client";

import type { ReadinessInput } from "@/lib/interview/readiness";
import type { SessionView } from "@/lib/interview/mock";
import type { StarStoryView } from "@/lib/interview/plans";

import { PageHeader } from "@/components/page-header";

import { MockSection } from "./mock-section";
import { PlansSection } from "./plans-section";
import type { PlanDetailView, PlanListItem, PlanQuestionView, PostingPicker } from "./plans-section";
import { ReadinessSection } from "./readiness-section";
import { StoriesSection } from "./stories-section";
import { LearningSection } from "./learning-section";
import type { LearningDetailView, LearningListItem, TargetPicker } from "./learning-section";

// The interview hub (master.md §14 "Interview Preparation"): readiness from
// real data, interview plans with their predicted questions, mock
// interviews, the STAR story bank and learning plans, all on one page. The
// sections only show what the services and jobs kept; the AI work runs in
// jobs.ts behind actions.ts.

export type { PlanDetailView, PlanListItem, PlanQuestionView, PostingPicker } from "./plans-section";
export type { LearningDetailView, LearningListItem, TargetPicker } from "./learning-section";

export type InterviewScreenProps = {
  /** An AI provider is set up, so the AI buttons show. */
  aiReady: boolean;
  /** The raw counts readiness is computed from, not a readiness number. */
  readiness: ReadinessInput;
  plans: PlanListItem[];
  plan: PlanDetailView | null;
  sessions: SessionView[];
  session: SessionView | null;
  /** The questions the open session asks: its plan's, or every plan's. */
  sessionQuestions: PlanQuestionView[];
  stories: StarStoryView[];
  achievements: { id: string; title: string }[];
  /** Achievement titles by id, for the questions' evidence ids. */
  evidence: Record<string, string>;
  postings: PostingPicker[];
  targets: TargetPicker[];
  learningPlans: LearningListItem[];
  learningPlan: LearningDetailView | null;
};

export function InterviewScreen(props: InterviewScreenProps) {
  return (
    <>
      <PageHeader
        title="Interview prep"
        description="Predicted questions for the roles you are aiming at, mock interviews with feedback, your STAR stories, learning plans and how ready you are, all counted from your own evidence."
      />
      <div className="flex flex-col gap-10 px-10 pb-20">
        <ReadinessSection input={props.readiness} />
        <PlansSection plans={props.plans} plan={props.plan} postings={props.postings} aiReady={props.aiReady} evidence={props.evidence} />
        <MockSection sessions={props.sessions} session={props.session} questions={props.sessionQuestions} plans={props.plans} aiReady={props.aiReady} />
        <StoriesSection stories={props.stories} achievements={props.achievements} />
        <LearningSection plans={props.learningPlans} plan={props.learningPlan} postings={props.postings} targets={props.targets} aiReady={props.aiReady} />
      </div>
    </>
  );
}
