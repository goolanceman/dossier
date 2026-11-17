import Link from "next/link";

import type { AssessmentDecision } from "@/generated/prisma/enums";
import type { CareerIntel, CareerIntelMatch, CareerIntelProgress, CareerIntelSalary, CareerIntelUsage } from "@/lib/dashboard";

import { loadCareerIntel } from "@/lib/dashboard-data";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The decisions in words, as the intelligence page spells them. */
const DECISION_LABEL: Record<AssessmentDecision, string> = {
  STRONG_MATCH: "Strong match",
  POTENTIAL_MATCH: "Potential match",
  WEAK_MATCH: "Weak match",
  REJECT: "Rejected",
  PENDING: "Pending",
};

/** The career intelligence section (master.md Phase 14): what discovery found, what's waiting, preparation, salary, AI use and next actions. */
export function CareerIntelSection({ intel }: { intel: CareerIntel | null }) {
  if (intel === null) return null;
  return (
    <section aria-labelledby="intel-heading" className="col-span-full flex flex-col gap-6 rounded-panel border border-line-card bg-card p-7">
      <div className="flex flex-col gap-1">
        <h2 id="intel-heading" className="font-serif text-section">
          Career intelligence
        </h2>
        <p className="text-control text-muted">What discovery, preparation and AI use look like this week.</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] items-start gap-x-8 gap-y-6">
        <Discovery number={intel.newJobs} matches={intel.bestMatches} />
        <Review jobs={intel.review.jobs} questions={intel.review.questions} />
        {intel.progress && <Progress progress={intel.progress} />}
        {intel.salaries.length > 0 && <Salaries salaries={intel.salaries} />}
        <Usage usage={intel.usage} />
        {intel.actions.length > 0 && <Actions actions={intel.actions} />}
      </div>
    </section>
  );
}

/** Loads the career intelligence for the section, so the dashboard's own cards don't wait for it. */
export async function DashboardCareerIntel() {
  return <CareerIntelSection intel={await loadCareerIntel()} />;
}

/** A big figure, as the funnel's are. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse gap-0.5">
      <dt className="text-label text-muted">{label}</dt>
      <dd className="font-serif text-[32px] leading-none tabular-nums">{value}</dd>
    </div>
  );
}

/** A list row, as "Worth a look" draws them: a name, a line under it, and where it goes; plain when there's nowhere to go. */
function Row({ name, detail, action, href }: { name: string; detail?: string; action?: string; href?: string }) {
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-field font-medium">{name}</span>
        {detail && <span className="text-meta leading-[1.45] text-muted">{detail}</span>}
      </span>
      {action && <span className="mt-px flex-none text-meta text-muted">{action} →</span>}
    </>
  );
  if (!href) return <div className="flex items-start gap-3 px-2.5 py-[13px]">{content}</div>;
  return (
    <Link href={href} className="flex items-start gap-3 rounded-control px-2.5 py-[13px] text-ink hover:bg-hover">
      {content}
    </Link>
  );
}

/** New jobs the discovery runs fetched in the last 7 days, with the best matches among everything assessed. */
function Discovery({ number, matches }: { number: number | null; matches: CareerIntelMatch[] }) {
  if (number === null && matches.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      {number !== null && (
        <div className="flex flex-col gap-3">
          <h3 className="text-[15px] font-medium">New jobs discovered</h3>
          <dl className="flex gap-7">
            <Figure value={String(number)} label="in the last 7 days" />
          </dl>
        </div>
      )}
      {matches.length > 0 && (
        <div className="flex flex-col">
          <h3 className="pb-3 text-[15px] font-medium">Best matches</h3>
          <ul>
            {matches.map((match) => (
              <li key={match.postingId} className="-mx-2.5 border-t border-line">
                <Row
                  name={[match.company, match.title].filter(Boolean).join(", ")}
                  detail={`${match.score} · ${DECISION_LABEL[match.decision]}`}
                  action="Open"
                  href={`/intelligence/${match.postingId}`}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Jobs waiting on a decision, and gap questions waiting on answers. */
function Review({ jobs, questions }: { jobs: number; questions: number }) {
  if (jobs === 0 && questions === 0) return null;
  return (
    <div className="flex flex-col">
      <h3 className="pb-3 text-[15px] font-medium">Requiring review</h3>
      <ul>
        {jobs > 0 && (
          <li className="-mx-2.5 border-t border-line">
            <Row name={`${plural(jobs, "job waits", "jobs wait")} for your review.`} action="Review" href="/discovery" />
          </li>
        )}
        {questions > 0 && (
          <li className="-mx-2.5 border-t border-line">
            <Row name={`${plural(questions, "gap question waits", "gap questions wait")} for answers.`} action="Answer" href="/interview" />
          </li>
        )}
      </ul>
    </div>
  );
}

/** How the interview and learning preparation stands. */
function Progress({ progress }: { progress: CareerIntelProgress }) {
  return (
    <div className="flex flex-col">
      <h3 className="pb-3 text-[15px] font-medium">Preparation progress</h3>
      <ul className="flex flex-col gap-1">
        {progress.totalQuestions > 0 && (
          <li className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
            <span className="text-muted">Interview questions prepared</span>
            <span className="tabular-nums">
              {progress.preparedQuestions} of {progress.totalQuestions}
            </span>
          </li>
        )}
        {progress.totalTopics > 0 && (
          <li className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
            <span className="text-muted">Learning topics completed</span>
            <span className="tabular-nums">
              {progress.completedTopics} of {progress.totalTopics}
            </span>
          </li>
        )}
        {progress.mockSessions > 0 && (
          <li className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
            <span className="text-muted">Mock interviews completed</span>
            <span className="tabular-nums">
              {progress.mockSessions}
              {progress.mockMeanScore !== null ? ` · mean score ${progress.mockMeanScore}` : ""}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

/** The latest salary research, each figure shown with where it came from (master.md §4). */
function Salaries({ salaries }: { salaries: CareerIntelSalary[] }) {
  return (
    <div className="flex flex-col">
      <h3 className="pb-3 text-[15px] font-medium">Salary insights</h3>
      <ul>
        {salaries.map((salary) => (
          <li key={salary.id} className="-mx-2.5 border-t border-line">
            <Row
              name={[salary.company, salary.title].filter(Boolean).join(", ") || "Salary research"}
              detail={[salary.range, salary.statusLabel].filter(Boolean).join(" · ")}
              action={salary.postingId ? "Open" : undefined}
              href={salary.postingId ? `/intelligence/${salary.postingId}` : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** AI calls over the last 7 days, honest about what the providers didn't report. */
function Usage({ usage }: { usage: CareerIntelUsage }) {
  const tokens =
    usage.inputTokens === null && usage.outputTokens === null
      ? null
      : [
          usage.inputTokens !== null ? `${usage.inputTokens.toLocaleString("en-GB")} in` : "",
          usage.outputTokens !== null ? `${usage.outputTokens.toLocaleString("en-GB")} out` : "",
        ]
          .filter(Boolean)
          .join(" · ");
  return (
    <div className="flex flex-col">
      <h3 className="pb-3 text-[15px] font-medium">AI usage</h3>
      {usage.calls === 0 ? (
        <p className="py-1.5 text-sm text-muted">No AI activity in the last 7 days.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          <li className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
            <span className="text-muted">Calls</span>
            <span className="tabular-nums">
              {usage.calls}
              {usage.failures > 0 ? ` · ${plural(usage.failures, "failure", "failures")}` : ""}
            </span>
          </li>
          {tokens !== null && (
            <li className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
              <span className="text-muted">Tokens reported</span>
              <span className="tabular-nums">{tokens}</span>
            </li>
          )}
          {usage.estimatedCost !== null && (
            <li className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
              <span className="text-muted">Estimated cost</span>
              <span className="tabular-nums">{usage.estimatedCost} cents</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** What's worth doing next, from real data. */
function Actions({ actions }: { actions: CareerIntel["actions"] }) {
  return (
    <div className="flex flex-col">
      <h3 className="pb-3 text-[15px] font-medium">Recommended next actions</h3>
      <ul>
        {actions.map((action) => (
          <li key={action.reason} className="-mx-2.5 border-t border-line">
            <Row name={action.reason} action={action.action} href={action.href} />
          </li>
        ))}
      </ul>
    </div>
  );
}
