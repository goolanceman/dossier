import type { Metadata } from "next";

import { isAiConfigured } from "@/lib/ai/config";
import { listTargets } from "@/lib/career/targets";
import { formatDate } from "@/lib/dates";
import { loadProfile } from "@/lib/profile-data";
import { profileResumeText } from "@/lib/resume-intel/base-resume-text";
import { listCritiques } from "@/lib/resume-intel/critique";

import { loadMasterPreview } from "./master-preview";
import { ResumeIntel } from "./resume-intel";
import { overallViewSchema, type CritiqueSummary } from "./view";

export const metadata: Metadata = { title: "Resume intelligence" };

/** A rough word count, for the base-resume line (master.md §5.1). */
const roughWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Resume intelligence (master.md §5.1–5.2); `?job=` follows a critique in progress. */
export default async function ResumeIntelPage({ searchParams }: PageProps<"/resume-intel">) {
  const [{ job }, aiReady, rows, targets, profile, master] = await Promise.all([
    searchParams,
    isAiConfigured(),
    listCritiques(),
    listTargets(),
    loadProfile(),
    loadMasterPreview(),
  ]);
  const critiques: CritiqueSummary[] = rows.map((row) => {
    const overall = overallViewSchema.safeParse(row.overall);
    return {
      id: row.id,
      fileName: row.fileName,
      date: formatDate(row.createdAt),
      score: overall.success ? overall.data.score : null,
      atsReadiness: overall.success ? overall.data.atsReadiness : null,
    };
  });
  return (
    <ResumeIntel
      aiReady={aiReady}
      initialJobId={typeof job === "string" ? job : null}
      critiques={critiques}
      targets={targets.map(({ id, title, summary }) => ({ id, title, summary }))}
      profile={profile}
      baseResume={{
        name: profile.basics.name,
        headline: profile.basics.headline,
        words: roughWords(profileResumeText(profile)),
      }}
      master={master}
    />
  );
}
