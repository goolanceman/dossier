import type { Metadata } from "next";
import { cache } from "react";
import { z } from "zod";

import { activityTimeline } from "@/lib/activity";
import { isAiConfigured } from "@/lib/ai/config";
import { editsSchema, matchSchema, matchScore } from "@/lib/application-data";
import { loadApplication, loadDocuments, readJson } from "@/lib/application-documents";
import { formatShortDate } from "@/lib/dates";
import { resolveFileName } from "@/lib/file-name";
import { refineJobKey } from "@/lib/jobs/refine";
import { regenerateUnitJob, unitJobKey } from "@/lib/jobs/regenerate-unit";
import { findUnfinishedJobs } from "@/lib/jobs/runner";
import { writeDocumentJobKey } from "@/lib/jobs/write-document";
import { scoreResumeJobKey } from "@/lib/jobs/score-resume";
import { resumeFitSchema } from "@/lib/resume-fit";
import { emailJobKey } from "@/lib/jobs/write-email";
import { googleConnection } from "@/lib/google/account";
import { pullInterviewEvents } from "@/lib/google/availability";
import { loadConversation } from "@/lib/google/inbox-data";
import { readFrozenCopy } from "@/lib/frozen-copy";
import { profileUpdate } from "@/lib/profile-update";
import { refineSuggestions } from "@/lib/refine-suggestions";
import { resumeContent, sectionsWithContent } from "@/lib/resume-content";
import { sectionName } from "@/lib/resume-sections";
import { loadThemes } from "@/lib/theme-data";
import { userTimeZone } from "@/lib/time-zone";
import { prisma } from "@/lib/prisma";
import { estimateLabel } from "@/lib/salary/estimate";
import { DocumentKind, GapQuestionStatus, LearningStatus, SalaryStatus } from "@/generated/prisma/enums";

import { ApplicationView } from "./application-view";
import { IntelligencePanel, type IntelligenceView } from "./intelligence-panel";
import { metaLine } from "./meta";
import { tabFrom } from "./tabs";

/** The rounds JSON column read back as data, as the interview page reads its plans' (its page.tsx). */
const roundsSchema = z.array(z.object({ name: z.string(), focus: z.string() })).catch([]);

/** Everything the Intelligence panel shows, read in one go alongside the page's other loads. */
async function loadIntelligence(id: string): Promise<IntelligenceView | null> {
  const posting = await prisma.posting.findUnique({
    where: { applicationId: id },
    select: {
      id: true,
      company: true,
      assessments: { select: { decision: true, score: true, stage: true } },
      salaryEstimate: { select: { status: true, minimum: true, maximum: true, currency: true, basis: true } },
      gapQuestions: { where: { status: GapQuestionStatus.OPEN }, select: { id: true } },
      interviewPlans: {
        select: {
          id: true, role: true, rounds: true,
          questions: { select: { prepared: true } },
        },
      },
      learningPlans: { select: { id: true, goal: true, topics: { select: { status: true } } } },
    },
  });
  if (!posting) return null;
  const companyResearch = await prisma.companyResearch.findUnique({
    where: { company: posting.company || (await loadApplication(id)).company },
    select: { id: true },
  });
  const [resumeDoc, letterDoc] = await Promise.all([
    prisma.document.findUnique({ where: { applicationId_kind: { applicationId: id, kind: DocumentKind.RESUME } }, select: { writtenWith: true } }),
    prisma.document.findUnique({ where: { applicationId_kind: { applicationId: id, kind: DocumentKind.COVER_LETTER } }, select: { writtenWith: true } }),
  ]);
  return {
    postingId: posting.id,
    assessment: posting.assessments[0]
      ? { decision: posting.assessments[0].decision, score: posting.assessments[0].score }
      : null,
    salary: posting.salaryEstimate
      ? { label: estimateLabel(posting.salaryEstimate.status), range: salaryRange(posting.salaryEstimate) }
      : null,
    openGaps: posting.gapQuestions.length,
    interviewPlans: posting.interviewPlans.map((plan) => ({
      id: plan.id,
      role: plan.role,
      rounds: roundsSchema.parse(plan.rounds ?? []),
      questions: plan.questions.length,
      prepared: plan.questions.filter((q) => q.prepared).length,
    })),
    learningPlans: posting.learningPlans.map((plan) => ({
      id: plan.id,
      goal: plan.goal,
      completed: plan.topics.filter((t) => t.status === LearningStatus.COMPLETED).length,
      total: plan.topics.length,
    })),
    companyResearched: companyResearch !== null,
    documents: [
      { kind: "RESUME" as const, writtenWith: resumeDoc?.writtenWith ?? null },
      { kind: "COVER_LETTER" as const, writtenWith: letterDoc?.writtenWith ?? null },
    ],
  };
}

const money = (amount: number, currency: string) => `${currency} ${amount.toLocaleString("en-GB")}`;

const BASIS_LABEL: Record<string, string> = { ANNUAL: "a year", MONTHLY: "a month", HOURLY: "an hour" };

/** The range in words, as the intelligence page's Salary section shows one, or null when there's no figure. */
const salaryRange = (estimate: {
  status: SalaryStatus;
  minimum: number | null;
  maximum: number | null;
  currency: string;
  basis: string;
}): string | null => {
  if (estimate.status === SalaryStatus.UNAVAILABLE) return null;
  const { minimum, maximum, currency } = estimate;
  if (minimum === null && maximum === null) return null;
  const range =
    minimum !== null && maximum !== null
      ? minimum === maximum
        ? money(minimum, currency)
        : `${money(minimum, currency)} to ${money(maximum, currency)}`
      : [minimum !== null ? `from ${money(minimum, currency)}` : "", maximum !== null ? `up to ${money(maximum, currency)}` : ""].filter(Boolean).join(" ");
  return `${range} ${BASIS_LABEL[estimate.basis] ?? "a year"}`;
};

/**
 * Takes an interview moved or deleted in Google Calendar into the
 * application, once per request and before anything reads it:
 * loadApplication is cached for the request, and the title reads it first.
 */
const pullCalendar = cache((id: string) => pullInterviewEvents({ applicationId: id, signal: AbortSignal.timeout(3_000) }).catch(() => 0));

export async function generateMetadata({ params }: PageProps<"/applications/[id]">): Promise<Metadata> {
  const { id } = await params;
  await pullCalendar(id);
  const application = await loadApplication(id);
  return { title: application.title.trim() || "Untitled application" };
}

/** One application (PRD §6.5): its status, tailored documents, email, posting and notes. */
export default async function ApplicationPage({ params, searchParams }: PageProps<"/applications/[id]">) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  await pullCalendar(id);
  const [{ application, profile, liveProfile, sent, settings, extracted, resume, letter, email, includeReferences, sections, ownSections, letterDate }, aiReady, unitJobs, refineJobs, emailJobs, timeZone, google, emails, themes, resumeJobs, letterJobs, scoreJobs, intelligence] =
    await Promise.all([
      loadDocuments(id),
      isAiConfigured(),
      findUnfinishedJobs(unitJobKey(id)),
      findUnfinishedJobs(refineJobKey(id)),
      findUnfinishedJobs(emailJobKey(id)),
      userTimeZone(),
      googleConnection(),
      loadConversation(id),
      loadThemes(),
      findUnfinishedJobs(writeDocumentJobKey(id, "RESUME")),
      findUnfinishedJobs(writeDocumentJobKey(id, "COVER_LETTER")),
      findUnfinishedJobs(scoreResumeJobKey(id)),
      loadIntelligence(id),
    ]);

  const match = readJson(matchSchema, application.match);
  const messages = application.messages
    .map((message, index) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      targetUnit: message.targetUnit,
      // Written in code when the application was created (E7-6).
      opening: index === 0 && message.role === "AI" && !message.writtenWith,
      canUndo: message.role === "AI" && (readJson(editsSchema, message.edits)?.length ?? 0) > 0,
      undone: message.undone,
    }))
    // Settings → "Show what changed" off hides the list of what was tailored (SET-5).
    .filter((message) => settings.showDiff || !message.opening);
  const { title, company, location, status, tone, language, followThemeLayout, showPhoto, nextInterviewAt } = application;
  // Units still being rewritten, so a reload keeps showing it.
  const rewriting = unitJobs.flatMap((job) => {
    const input = regenerateUnitJob.input.safeParse(job.input);
    return input.success ? [{ jobId: job.id, document: input.data.document, unitId: input.data.unitId }] : [];
  });
  // The PDFs to attach to the email, named as they'll download (SET-8).
  const fileName = (doc: "RESUME" | "COVER_LETTER") =>
    resolveFileName(settings.fileNamePattern, { name: profile.basics.name, company: application.company, role: application.role, doc, date: new Date() });

  return (
    <>
    <ApplicationView
      application={{
        id,
        title,
        company,
        location,
        status,
        tone,
        language,
        followThemeLayout,
        showPhoto,
        archived: application.archivedAt !== null,
        awaitingReview: application.awaitingReview,
        nextInterviewAt,
      }}
      timeZone={timeZone}
      posting={{
        text: application.postingText,
        // New applications only keep web links, but an imported file could carry any URL (E11-5).
        url: /^https?:\/\//i.test(application.postingUrl) ? application.postingUrl : "",
        pasted: formatShortDate(application.createdAt),
      }}
      match={match}
      requirements={extracted?.requirements ?? []}
      facts={application.facts}
      activity={activityTimeline({ notes: application.notes, events: application.events, createdAt: application.createdAt })}
      meta={metaLine(application)}
      resume={resume}
      letter={letter}
      themes={themes}
      baseThemeId={settings.baseThemeId}
      email={email}
      writingEmail={emailJobs.at(-1)?.id ?? null}
      writingDocuments={{ resume: resumeJobs.at(-1)?.id ?? null, letter: letterJobs.at(-1)?.id ?? null }}
      resumeFit={readJson(resumeFitSchema, application.resumeFit)}
      scoringResume={scoreJobs.at(-1)?.id ?? null}
      attachments={{ resume: resume ? fileName("RESUME") : null, letter: letter ? fileName("COVER_LETTER") : null }}
      gmail={
        google.status === "not-configured" && emails.length === 0
          ? undefined
          : {
              sender:
                google.status === "connected"
                  ? google.canSend
                    ? { from: google.email }
                    : { from: null, reason: "no-permission" }
                  : { from: null, reason: google.status === "not-configured" ? "not-configured" : "not-connected" },
              sentBefore: application.emailThreadId !== null,
              emails,
              reading: google.status === "connected" && google.canRead && settings.gmailRead,
            }
      }
      profile={profile}
      paper={settings.paper}
      dateFormat={settings.dateFormat}
      includeReferences={includeReferences}
      sections={sections}
      ownSections={ownSections}
      sent={sent}
      canUpdate={
        resume !== null &&
        profileUpdate({
          copy: readFrozenCopy(application.frozen)?.profile ?? null,
          live: liveProfile,
          units: resume.units,
          trimmed: resume.trimmed ?? null,
          language: application.language,
          includeReferences,
        }).changed
      }
      baseSections={sectionsWithContent(resumeContent(liveProfile, { includeReferences: true })).map((key) => ({ key, name: sectionName(key, liveProfile.customSections) }))}
      letterDate={letterDate}
      score={match && match.items.length > 0 ? matchScore(match) : null}
      initialTab={tabFrom(tab)}
      aiReady={aiReady}
      rewriting={rewriting}
      messages={messages}
      refining={refineJobs.at(-1)?.id ?? null}
      suggestions={refineSuggestions({
        match,
        requirements: extracted?.requirements ?? [],
        tone,
        hasSummary: Boolean(resume?.units.some((unit) => unit.id === "summary" && unit.text.trim())),
      })}
    />
    {intelligence ? <IntelligencePanel intelligence={intelligence} /> : null}
    </>
  );
}
