// Interview readiness (master.md §7.6): a deterministic calculation over what
// actually happened, never an AI opinion. Prepared questions drive the
// dimensions, finished mock sessions with a passing score add a capped bonus,
// and unanswered gap questions subtract a capped penalty. No randomness, no
// model in the loop, so the same input always gives the same number.

/** A question counts for a dimension when its category is in the set. */
const TECHNICAL_CATEGORIES = new Set(["TECHNICAL", "SYSTEM_DESIGN", "ARCHITECTURE", "AI_LLM"]);
const BEHAVIORAL_CATEGORIES = new Set(["RECRUITER", "HR", "BEHAVIORAL", "HIRING_MANAGER", "CULTURE", "LEADERSHIP"]);
const SYSTEM_DESIGN_CATEGORIES = new Set(["SYSTEM_DESIGN"]);

/** Points each completed mock session with a passing score adds, capped at the cap. */
const SESSION_BONUS = 5;
const SESSION_BONUS_CAP = 15;
/** Passing score a mock session needs for its bonus. */
const SESSION_PASS = 60;
/** Points each unanswered gap question subtracts, capped at the cap. */
const GAP_PENALTY = 2;
const GAP_PENALTY_CAP = 10;

export type ReadinessInput = {
  questions: { category: string; difficulty: string; prepared: boolean }[];
  sessions: { kind: string; status: string; score: number | null }[];
  storyCount: number;
  unansweredGaps: number;
};

export type Readiness = {
  overall: number;
  technical: number;
  behavioral: number;
  systemDesign: number;
  preparedQuestions: number;
  totalQuestions: number;
  completedSessions: number;
  verdict: string;
};

/** The prepared share of a dimension's questions, or null when it has none. */
function preparedShare(questions: ReadinessInput["questions"], categories: Set<string>): number | null {
  const mine = questions.filter((question) => categories.has(question.category));
  if (mine.length === 0) return null;
  return Math.round((mine.filter((question) => question.prepared).length / mine.length) * 100);
}

/** Plain text for the overall number; no score dressed up as more than it is. */
function verdictFor(overall: number): string {
  if (overall >= 80) return "Ready to interview. Keep sharp with mock sessions.";
  if (overall >= 60) return "Nearly ready. Practice the weak dimensions.";
  if (overall >= 40) return "Getting there. Prepare the weakest areas first.";
  return "Early days. Answer the gap questions and prepare the basics.";
}

/**
 * The formula, in one place:
 * - a dimension's score is the percentage of its questions marked prepared;
 * - the base is the mean of the dimensions that have questions, so a plan
 *   with no system design round yet isn't dragged down by one;
 * - completed mock sessions with a score of 60 or more add 5 points each, at
 *   most 15;
 * - unanswered gap questions subtract 2 points each, at most 10;
 * - the total is clamped to 0..100.
 * storyCount and the session kind ride along for the dashboard; they don't
 * change the number.
 */
export function computeReadiness(input: ReadinessInput): Readiness {
  const technical = preparedShare(input.questions, TECHNICAL_CATEGORIES);
  const behavioral = preparedShare(input.questions, BEHAVIORAL_CATEGORIES);
  const systemDesign = preparedShare(input.questions, SYSTEM_DESIGN_CATEGORIES);
  const covered = [technical, behavioral, systemDesign].filter((share) => share !== null);
  const base = covered.length === 0 ? 0 : Math.round(covered.reduce((sum, share) => sum + share!, 0) / covered.length);

  const completedSessions = input.sessions.filter((session) => session.status === "COMPLETED");
  const passing = completedSessions.filter((session) => session.score !== null && session.score >= SESSION_PASS);
  const bonus = Math.min(SESSION_BONUS_CAP, passing.length * SESSION_BONUS);
  const penalty = Math.min(GAP_PENALTY_CAP, input.unansweredGaps * GAP_PENALTY);

  const overall = Math.max(0, Math.min(100, base + bonus - penalty));
  return {
    overall,
    technical: technical ?? 0,
    behavioral: behavioral ?? 0,
    systemDesign: systemDesign ?? 0,
    preparedQuestions: input.questions.filter((question) => question.prepared).length,
    totalQuestions: input.questions.length,
    completedSessions: completedSessions.length,
    verdict: verdictFor(overall),
  };
}
