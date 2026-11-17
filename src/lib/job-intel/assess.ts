import "server-only";

import type { AssessmentDecision } from "@/generated/prisma/client";
import type { JobAssessment, RequirementMatch } from "@/lib/ai/task-contracts";
import { verifiedAchievementIds } from "@/lib/career/achievements";
import { prisma } from "@/lib/prisma";

import { applyMandatoryRules, type MandatoryRule } from "./mandatory";
import { loadWeights, weightedScore, type Weights } from "./weights";

// The full JD assessment (master.md §3.2-3.3): takes the AI task's answer,
// re-checks every achievement id it pointed at against the evidence library,
// scores the dimensions with the configured weights, applies the mandatory
// rejection rules, and keeps the whole thing on the posting's JobAssessment
// row. It complements the existing scorer (src/lib/scoring), which Find jobs
// and the agent keep using.

/** How the AI task's recommendation lands in the AssessmentDecision enum. */
const DECISION_BY_RECOMMENDATION: Record<JobAssessment["decision"]["recommendation"], AssessmentDecision> = {
  APPLY: "STRONG_MATCH",
  APPLY_AFTER_PREPARATION: "POTENTIAL_MATCH",
  SAVE_FOR_LATER: "WEAK_MATCH",
  REJECT: "REJECT",
};

export type PersistAssessmentInput = {
  postingId: string;
  /** The search profile it was assessed against, when there was one. */
  profileId?: string;
  /** The AI task's answer, already validated against its contract. */
  assessment: JobAssessment;
  /** Defaults to the weights stored under the "jobIntel:weights" setting. */
  weights?: Weights;
  /** Failed mandatory rejection rules; a score does not override these. */
  mandatoryRules: MandatoryRule[];
  /** The prompt version that produced the assessment, e.g. "assess-job@1". */
  promptVersion: string;
};

/**
 * Keeps one requirement's evidence ids the library can actually back
 * (master.md §3.3): unknown ids are dropped, and a strong match left with no
 * evidence at all drops to partial. Transferable experience stays transferable;
 * nothing else is recomputed.
 */
function keepKnownEvidence(requirements: RequirementMatch[], verified: Set<string>): { requirements: RequirementMatch[]; dropped: number; downgraded: number } {
  let dropped = 0;
  let downgraded = 0;
  const kept = requirements.map((requirement) => {
    const evidenceIds = requirement.evidenceIds.filter((id) => verified.has(id));
    dropped += requirement.evidenceIds.length - evidenceIds.length;
    if (requirement.status === "STRONG_EVIDENCE" && evidenceIds.length === 0 && requirement.evidenceIds.length > 0) {
      downgraded += 1;
      return { ...requirement, evidenceIds, status: "PARTIAL_EVIDENCE" as const };
    }
    return evidenceIds.length === requirement.evidenceIds.length ? requirement : { ...requirement, evidenceIds };
  });
  return { requirements: kept, dropped, downgraded };
}

/**
 * Scores and stores the assessment: the weighted score from the dimension
 * scores, the decision mapped from the recommendation, the reasons each stage
 * passed or failed. Mandatory rules override the score (master.md §3.2); when
 * they force REJECT, the AI's own recommendation stays in the reasons so
 * nothing is lost.
 */
export async function persistAssessment(input: PersistAssessmentInput) {
  const { assessment } = input;
  const ids = [...new Set(assessment.requirements.flatMap((requirement) => requirement.evidenceIds))];
  const verified = new Set(ids.length === 0 ? [] : await verifiedAchievementIds(ids));
  const { requirements, dropped, downgraded } = keepKnownEvidence(assessment.requirements, verified);

  const weights = input.weights ?? (await loadWeights());
  const score = weightedScore(assessment.dimensions, weights);
  const decision = applyMandatoryRules(assessment.decision, input.mandatoryRules);
  const decisionValue = DECISION_BY_RECOMMENDATION[decision.recommendation];
  const forced = input.mandatoryRules.length > 0;
  const rejectedReason = forced ? (input.mandatoryRules[0]?.reason ?? "") : "";

  const reasons = [
    `AI recommendation ${assessment.decision.recommendation}, weighted score ${score} of 100.`,
    downgraded > 0 ? `${downgraded} strong match${downgraded === 1 ? "" : "es"} dropped to partial evidence after checking the library.` : "",
    dropped > 0 ? `${dropped} achievement reference${dropped === 1 ? "" : "s"} dropped: not in the evidence library.` : "",
    ...(input.mandatoryRules.length === 0 ? ["No mandatory rejection rule matched."] : input.mandatoryRules.map((rule) => `Mandatory rule ${rule.rule}: ${rule.reason}`)),
  ].filter(Boolean);

  const profile = input.profileId === undefined ? {} : { profileId: input.profileId };
  const row = {
    ...profile,
    stage: "ASSESSED",
    decision: decisionValue,
    score,
    confidence: assessment.decision.confidence,
    dimensions: assessment.dimensions,
    requirements,
    reasons,
    rejectedReason,
    assessedWith: input.promptVersion,
  };
  return prisma.jobAssessment.upsert({
    where: { postingId: input.postingId },
    create: { postingId: input.postingId, ...row },
    update: { ...row },
  });
}
