import type { Metadata } from "next";

import { isAiConfigured } from "@/lib/ai/config";
import { listAchievements } from "@/lib/career/achievements";
import { listDocs } from "@/lib/career/knowledge";
import { listTargets } from "@/lib/career/targets";

import { AchievementsSection } from "./achievements-section";
import { CareerScreen } from "./career-screen";
import { KnowledgeSection } from "./knowledge-section";
import { TargetsSection } from "./targets-section";
import { careerSectionFromParam } from "./sections";

export const metadata: Metadata = { title: "Career" };

/** The career screen (master.md Phase 1). The section is in `?section=` (E4-1). */
export default async function CareerPage({ searchParams }: PageProps<"/career">) {
  const [params, achievements, targets, docs, aiReady] = await Promise.all([
    searchParams,
    listAchievements(),
    listTargets(),
    listDocs(),
    isAiConfigured(),
  ]);
  const section = careerSectionFromParam(params.section);
  return (
    <CareerScreen section={section}>
      {section === "achievements" && <AchievementsSection achievements={achievements} />}
      {section === "targets" && <TargetsSection targets={targets} />}
      {section === "knowledge" && <KnowledgeSection docs={docs} aiReady={aiReady} />}
    </CareerScreen>
  );
}
