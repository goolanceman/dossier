import type { Metadata } from "next";

import { isAiConfigured } from "@/lib/ai/config";
import { listAchievements } from "@/lib/career/achievements";
import { listDocs } from "@/lib/career/knowledge";
import { listCareerPlans, hasResumeContent } from "@/lib/career/plan";
import { listTargets } from "@/lib/career/targets";
import { loadProfile } from "@/lib/profile-data";

import { AchievementsSection } from "./achievements-section";
import { CareerPlanSection } from "./career-plan-section";
import { CareerScreen } from "./career-screen";
import { KnowledgeSection } from "./knowledge-section";
import { TargetsSection } from "./targets-section";
import { careerSectionFromParam } from "./sections";

export const metadata: Metadata = { title: "Career" };

/** The career screen (master.md Phase 1). The section is in `?section=` (E4-1). */
export default async function CareerPage({ searchParams }: PageProps<"/career">) {
  const [params, achievements, targets, docs, plans, aiReady] = await Promise.all([
    searchParams,
    listAchievements(),
    listTargets(),
    listDocs(),
    listCareerPlans(),
    isAiConfigured(),
  ]);
  const section = careerSectionFromParam(params.section);
  // Only the plan section needs to know whether a resume exists, and the profile is heavy.
  const profile = section === "plan" ? await loadProfile() : null;
  return (
    <CareerScreen section={section}>
      {section === "achievements" && <AchievementsSection achievements={achievements} />}
      {section === "targets" && <TargetsSection targets={targets} />}
      {section === "knowledge" && <KnowledgeSection docs={docs} aiReady={aiReady} />}
      {section === "plan" && (
        <CareerPlanSection plans={plans} targets={targets} aiReady={aiReady} hasResume={profile ? hasResumeContent(profile) : false} />
      )}
    </CareerScreen>
  );
}
