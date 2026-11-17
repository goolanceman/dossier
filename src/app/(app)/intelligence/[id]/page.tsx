import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { isAiConfigured } from "@/lib/ai/config";
import { companyResearchSchema, dimensionScoresSchema, requirementMatchSchema, type CompanyResearchResult } from "@/lib/ai/task-contracts";
import { GapQuestionStatus } from "@/generated/prisma/enums";
import { listAchievements } from "@/lib/career/achievements";
import { listGapQuestions } from "@/lib/gaps/lifecycle";
import { critiqueSchema, type JobCritique } from "@/lib/job-intel/critique";
import { loadWeights } from "@/lib/job-intel/weights";
import { prisma } from "@/lib/prisma";
import { getEstimate, estimateLabel } from "@/lib/salary/estimate";

import { IntelligenceScreen, type AssessmentView, type SalaryEstimateView } from "./intelligence-screen";

export const metadata: Metadata = { title: "Job intelligence" };

// Job Intelligence (master.md Phase 3, §14): one posting's assessment,
// salary, critique, gap questions and company research, all read from what
// the services and jobs keep. Nothing here decides; everything was decided
// where the data was made.

const sourceSchema = z.object({ url: z.string(), label: z.string(), retrievedAt: z.string() });

/** Parsed or null: a stored JSON column that doesn't match its contract shows as absent, never as an error. */
function readOrNull<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (value === null || value === undefined) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const sourcesOf = (value: unknown) => z.array(sourceSchema).catch([]).parse(value);

/** A posting's intelligence page. The id is the Posting's. */
export default async function IntelligencePage({ params }: PageProps<"/intelligence/[id]">) {
  const { id } = await params;
  const [posting, aiReady, weights] = await Promise.all([prisma.posting.findUnique({ where: { id } }), isAiConfigured(), loadWeights()]);
  if (!posting) notFound();

  const [row, estimate, openGaps, companyRow, interviewPlan, learningPlan] = await Promise.all([
    prisma.jobAssessment.findUnique({ where: { postingId: id } }),
    getEstimate(id),
    listGapQuestions({ postingId: id, status: GapQuestionStatus.OPEN }),
    posting.company.trim() === "" ? Promise.resolve(null) : prisma.companyResearch.findUnique({ where: { company: posting.company } }),
    prisma.interviewPlan.findFirst({ where: { postingId: id }, select: { id: true }, orderBy: { createdAt: "desc" } }),
    prisma.learningPlan.findFirst({ where: { postingId: id }, select: { id: true }, orderBy: { createdAt: "desc" } }),
  ]);

  // A row without a score hasn't been assessed (a critique-only run starts one);
  // the page treats it as not assessed and offers the assess button.
  const assessment: AssessmentView | null =
    row && row.score !== null
      ? {
          decision: row.decision,
          score: row.score,
          confidence: row.confidence,
          dimensions: readOrNull(dimensionScoresSchema, row.dimensions),
          requirements: z.array(requirementMatchSchema).catch([]).parse(row.requirements),
          reasons: z.array(z.string()).catch([]).parse(row.reasons),
          rejectedReason: row.rejectedReason,
          userOverride: row.userOverride,
        }
      : null;

  // The evidence titles the requirement mapping links to, in one pass.
  const evidenceIds = [...new Set((assessment?.requirements ?? []).flatMap((requirement) => requirement.evidenceIds))];
  const titles = new Map(evidenceIds.length === 0 ? [] : (await listAchievements()).map((achievement) => [achievement.id, achievement.title]));

  const critique: JobCritique | null = readOrNull(critiqueSchema, row?.critique);

  const estimateView: SalaryEstimateView | null =
    estimate === null
      ? null
      : {
          status: estimate.status,
          // The one wording master.md §4 allows for the kind of figure this is.
          statusLabel: estimateLabel(estimate.status),
          minimum: estimate.minimum,
          median: estimate.median,
          maximum: estimate.maximum,
          currency: estimate.currency,
          basis: estimate.basis,
          confidence: estimate.confidence,
          sourceCount: estimate.sourceCount,
          sources: sourcesOf(estimate.sources),
          methodology: estimate.methodology,
        };

  return (
    <IntelligenceScreen
      posting={{
        id: posting.id,
        title: posting.title,
        company: posting.company,
        place: posting.place,
        remote: posting.remote,
        salary: posting.salary,
        postedAt: posting.postedAt?.toISOString() ?? null,
        url: posting.url,
        via: posting.via,
      }}
      today={new Date().toISOString()}
      aiReady={aiReady}
      weights={weights}
      assessment={assessment}
      critique={critique}
      estimate={estimateView}
      evidence={Object.fromEntries(titles)}
      gaps={openGaps.map(({ id: questionId, question, reason, relatedRequirement, questionType, priority }) => ({
        id: questionId,
        question,
        reason,
        relatedRequirement,
        questionType,
        priority,
      }))}
      companyResearch={
        companyRow === null
          ? null
          : {
              research: readOrNull<CompanyResearchResult>(companyResearchSchema, companyRow.research),
              sources: sourcesOf(companyRow.sources),
              researchedWith: companyRow.researchedWith,
            }
      }
      hasInterviewPlan={interviewPlan !== null}
      hasLearningPlan={learningPlan !== null}
    />
  );
}
