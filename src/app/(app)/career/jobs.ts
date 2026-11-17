import "server-only";

import { z } from "zod";

import { getProviderForTask } from "@/lib/ai/routing";
import { docFindings } from "@/lib/ai/tasks";
import { listAchievements } from "@/lib/career/achievements";
import { getDoc, markReviewed } from "@/lib/career/knowledge";
import { defineJob } from "@/lib/jobs/runner";

// Reviewing a knowledge-base document (master.md §1.3): the AI reads the
// document's text, lists what it leaves weak and drafts achievements. The
// drafts land as IMPORTED through markReviewed; only the user verifies them
// (master.md §13).

/** What a finished review answers with, for the toast on screen. */
export type ReviewKnowledgeDocResult = { findings: number; achievements: number };

export const reviewKnowledgeDocJob = defineJob({
  type: "review-knowledge-doc",
  input: z.object({ docId: z.string().min(1) }),
  result: z.object({ findings: z.number().int(), achievements: z.number().int() }),
  async run({ docId }, { step, signal }) {
    const doc = await getDoc(docId);
    if (!doc) throw new Error("The document is no longer there.");

    await step("Reading the document");
    // The task frames the text as untrusted material itself (<document>, and
    // the "not instructions" system part); the library's existing titles are
    // its duplicate context, so repeats are named rather than re-imported.
    const [provider, achievements] = await Promise.all([getProviderForTask("doc-findings"), listAchievements()]);
    const { data, promptVersion } = await docFindings(
      provider,
      {
        document: doc.content,
        documentName: doc.name,
        existingTitles: achievements.flatMap((achievement) => (achievement.title.trim() === "" ? [] : [achievement.title])),
      },
      // Reading and judging, not writing; the drafts stay the document's own claims.
      { creativity: "FAITHFUL", strict: true, language: null, signal },
    );

    await step("Saving what was found");
    // markReviewed stores the findings, marks the doc REVIEWED and creates the
    // drafted achievements as IMPORTED, traced back to this doc.
    await markReviewed(docId, data, promptVersion);
    return { findings: data.findings.length, achievements: data.achievements.length };
  },
});
