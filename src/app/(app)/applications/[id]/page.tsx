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
import { emailJobKey } from "@/lib/jobs/write-email";
import { googleConnection } from "@/lib/google/account";
import { pullInterviewEvents } from "@/lib/google/availability";
import { loadConversation } from "@/lib/google/inbox-data";
import { prisma } from "@/lib/prisma";
import { refineSuggestions } from "@/lib/refine-suggestions";
import { estimateLabel } from "@/lib/salary/estimate";
import { loadThemes } from "@/lib/theme-data";
import { userTimeZone } from "@/lib/time-zone";
import { DocumentKind, GapQuestionStatus, LearningStatus, SalaryStatus } from "@/generated/prisma/enums";

import { ApplicationView } from "./application-view";
import { IntelligencePanel, type IntelligenceView } from "./intelligence-panel";
import { metaLine } from "./meta";
import { tabFrom } from "./tabs";

/**
 * Takes an interview moved or deleted in Google Calendar into the
 * application, once per request and before anything reads it:
 * loadApplication is cached for the request, and the title reads it first.
 */
const pullCalendar = cache((id: string) => pullInterviewEvents({ applicationId: id, signal: AbortSignal.timeout(3_000) }).catch(() => 0));

/** The rounds JSON column read back as data, as the interview page reads its plans' (its page.tsx). */
const roundsSchema = z.array(z.object({ name: z.string(), focus: z.string() })).catch([]);

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
 * The intelligence artifacts connected to one application (master.md Phase
 * 10): its posting's assessment, salary, gap questions, interview and
 * learning plans, company research by name, and the prompt versions that
 * wrote its tailored documents. One posting read with everything nested, plus
 * the company's research row; nothing here decides.
 */
async function loadIntelligence(id: string): Promise<IntelligenceView | null> {
  const [posting, application] = await Promise.all([
    prisma.posting.findUnique({
      where: { applicationId: id },
      select: {
        id: true,
        company: true,
        assessments: { select: { decision: true, score: true } },
        salaryEstimate: { select: { status: true, minimum: true, maximum: true, currency: true, basis: true } },
        gapQuestions: { where: { status: GapQuestionStatus.OPEN }, select: { id: true } },
        interviewPlans: {
          orderBy: { createdAt: "desc" },
          select: { id: true, role: true, rounds: true, questions: { select: { prepared: true } } },
        },
        learningPlans: {
          orderBy: { createdAt: "desc" },
          select: { id: true, goal: true, topics: { select: { status: true } } },
        },
      },
    }),
    prisma.application.findUnique({ where: { id }, select: { company: true, documents: { select: { kind: true, writtenWith: true } } } }),
  ]);
  if (!application) return null;

  // The intelligence page reads company research by the posting's company
  // name; an application made by hand is looked up under its own.
  const company = (posting !== null ? posting.company : application.company).trim();
  const companyRow = company === "" ? null : await prisma.companyResearch.findUnique({ where: { company }, select: { id: true } });
  const estimate = posting?.salaryEstimate ?? null;

  return {
    postingId: posting?.id ?? null,
    assessment: posting?.assessments[0] ?? null,
    salary:
      estimate === null
        ? null
        : {
            // The one wording master.md §4 allows for the kind of figure this is.
            label: estimateLabel(estimate.status),
            range: salaryRange(estimate),
          },
    openGaps: posting?.gapQuestions.length ?? 0,
    interviewPlans: (posting?.interviewPlans ?? []).map((plan) => ({
      id: plan.id,
      role: plan.role,
      rounds: roundsSchema.parse(plan.rounds),
      questions: plan.questions.length,
      prepared: plan.questions.filter((question) => question.prepared).length,
    })),
    learningPlans: (posting?.learningPlans ?? []).map((plan) => ({
      id: plan.id,
      goal: plan.goal,
      completed: plan.topics.filter((topic) => topic.status === LearningStatus.COMPLETED).length,
      total: plan.topics.length,
    })),
    companyResearched: companyRow !== null,
    documents: ([DocumentKind.RESUME, DocumentKind.COVER_LETTER] as const).flatMap((kind) => {
      // At most one document of each kind (@@unique of application and kind).
      const document = application.documents.find((entry) => entry.kind === kind);
      return document ? [{ kind, writtenWith: document.writtenWith }] : [];
    }),
  };
}

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
  const [{ application, profile, settings, extracted, resume, letter, email, includeReferences, letterDate }, aiReady, unitJobs, refineJobs, emailJobs, timeZone, google, emails, themes, intelligence] =
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
    {intelligence && <IntelligencePanel intelligence={intelligence} />}
    </>
  );
}
