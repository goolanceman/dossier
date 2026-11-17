import { z } from "zod";

// Strict response contracts for the career-intelligence AI tasks
// (master.md Phase 12). Every new task validates against one of these schemas
// before anything is saved; the shapes follow the existing task pattern
// (src/lib/ai/tasks/prompt-parts.ts). Ids in answers must reference records
// the caller passes in; code re-checks them before trusting them (Phase 13).

/** The evidence an answer may point at, so ids can be checked against it. */
export const evidenceRefSchema = z.string().min(1).max(100);
export type EvidenceRef = z.output<typeof evidenceRefSchema>;

const schemaMeta = { schema_version: z.literal("1.0"), task: z.string().min(1) };

const confidence = z.enum(["HIGH", "MEDIUM", "LOW"]);
const priority = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

// ── Screening (master.md §2.4 stage 3) ───────────────────────────────────────

export const screenPostingSchema = z.object({
  ...schemaMeta,
  task: z.literal("screen_posting"),
  verdict: z.enum(["SHORTLIST", "SKIP"]),
  reasons: z.array(z.string().max(300)).max(5),
  confidence: confidence,
});
export type ScreenPosting = z.output<typeof screenPostingSchema>;

// ── Full JD assessment (master.md §3.2–3.3, §12.1) ───────────────────────────

export const requirementStatus = z.enum([
  "STRONG_EVIDENCE",
  "PARTIAL_EVIDENCE",
  "TRANSFERABLE",
  "MISSING_EVIDENCE",
  "CONFIRMED_GAP",
  "NOT_APPLICABLE",
]);

export const requirementMatchSchema = z.object({
  requirement: z.string().max(300),
  /** REQUIRED or PREFERRED, as the JD states it. */
  importance: z.enum(["REQUIRED", "PREFERRED"]),
  status: requirementStatus,
  /** Achievement ids, checked against the library before saving. */
  evidenceIds: z.array(evidenceRefSchema).max(20),
  /** Quotations from the JD, kept exactly (master.md §12.5). */
  jdQuotes: z.array(z.string().max(300)).max(5),
  explanation: z.string().max(1_000),
  confidence: confidence,
});

export const dimensionScoresSchema = z.object({
  technicalSkills: z.number().min(0).max(100),
  relevantExperience: z.number().min(0).max(100),
  responsibilities: z.number().min(0).max(100),
  architecture: z.number().min(0).max(100),
  seniority: z.number().min(0).max(100),
  domain: z.number().min(0).max(100),
  locationRemote: z.number().min(0).max(100),
  employmentConditions: z.number().min(0).max(100),
});

export const assessmentDecisionSchema = z.object({
  recommendation: z.enum(["APPLY", "APPLY_AFTER_PREPARATION", "SAVE_FOR_LATER", "REJECT"]),
  compatibilityScore: z.number().min(0).max(100),
  confidence: confidence,
  mandatoryRejection: z.boolean(),
  summary: z.string().max(2_000),
});

export const jobAssessmentSchema = z.object({
  ...schemaMeta,
  task: z.literal("job_assessment"),
  decision: assessmentDecisionSchema,
  dimensions: dimensionScoresSchema,
  requirements: z.array(requirementMatchSchema).max(40),
  strengths: z.array(z.string().max(500)).max(10),
  gaps: z.array(z.string().max(500)).max(10),
  transferableSkills: z.array(z.string().max(500)).max(10),
  risks: z.array(z.string().max(500)).max(10),
  nextActions: z.array(z.string().max(300)).max(10),
});
export type JobAssessment = z.output<typeof jobAssessmentSchema>;
export type RequirementMatch = z.output<typeof requirementMatchSchema>;

// ── Salary research (master.md Phase 4) ──────────────────────────────────────

export const salaryResearchSchema = z.object({
  ...schemaMeta,
  task: z.literal("salary_research"),
  status: z.enum(["STATED", "CONFIRMED", "ESTIMATED", "UNAVAILABLE"]),
  minimum: z.number().min(0).nullable(),
  median: z.number().min(0).nullable(),
  maximum: z.number().min(0).nullable(),
  currency: z.string().length(3),
  /** ANNUAL, MONTHLY or HOURLY. */
  basis: z.enum(["ANNUAL", "MONTHLY", "HOURLY"]),
  confidence: confidence,
  /** Only URLs the research notes actually contained; checked by code. */
  sources: z
    .array(z.object({ url: z.string().max(500), label: z.string().max(200), retrievedAt: z.string().max(30) }))
    .max(10),
  methodology: z.string().max(2_000),
});
export type SalaryResearch = z.output<typeof salaryResearchSchema>;

// ── Resume critique (master.md §5.1–5.2, §12.2) ──────────────────────────────

export const resumeCritiqueSchema = z.object({
  ...schemaMeta,
  task: z.literal("resume_critique"),
  overall: z.object({
    /** An internal diagnostic estimate, never an employer screening result. */
    score: z.number().min(0).max(100),
    atsReadiness: z.enum(["POOR", "FAIR", "GOOD", "EXCELLENT"]),
    summary: z.string().max(2_000),
  }),
  findings: z
    .array(
      z.object({
        id: z.string().max(60),
        /** CONTENT, ATS, WRITING, RECRUITER. */
        category: z.enum(["CONTENT", "ATS", "WRITING", "RECRUITER"]),
        severity: priority,
        title: z.string().max(300),
        currentProblem: z.string().max(2_000),
        recommendation: z.string().max(2_000),
        expectedImpact: z.string().max(1_000),
        /** LIGHT, MEDIUM, HEAVY. */
        effort: z.enum(["LIGHT", "MEDIUM", "HEAVY"]),
        evidenceRequired: z.array(z.string().max(300)).max(10),
        relatedJobRequirements: z.array(z.string().max(300)).max(10),
        confidence: confidence,
      }),
    )
    .max(40),
  keywordCoverage: z.array(z.string().max(300)).max(20),
  formattingIssues: z.array(z.string().max(300)).max(20),
  strengths: z.array(z.string().max(500)).max(10),
});
export type ResumeCritique = z.output<typeof resumeCritiqueSchema>;

// ── Gap questions (master.md Phase 6, §12.3) ─────────────────────────────────

export const gapQuestionsSchema = z.object({
  ...schemaMeta,
  task: z.literal("gap_questions"),
  questions: z
    .array(
      z.object({
        id: z.string().max(60),
        question: z.string().max(1_000),
        reason: z.string().max(1_000),
        relatedRequirement: z.string().max(300),
        expectedInformation: z.array(z.string().max(300)).max(5),
        /** TECHNICAL, ACHIEVEMENT, METRICS, LEADERSHIP, PROJECT, BUSINESS, CLARIFICATION. */
        questionType: z.enum(["TECHNICAL", "ACHIEVEMENT", "METRICS", "LEADERSHIP", "PROJECT", "BUSINESS", "CLARIFICATION"]),
        priority: priority,
        /** False when the profile already answers it; code drops those. */
        alreadyKnown: z.boolean(),
      }),
    )
    .max(20),
});
export type GapQuestions = z.output<typeof gapQuestionsSchema>;

// ── Interview preparation (master.md Phase 7, §12.4) ─────────────────────────

export const interviewQuestionSchema = z.object({
  id: z.string().max(60),
  category: z.enum([
    "RECRUITER", "HR", "BEHAVIORAL", "HIRING_MANAGER", "TECHNICAL",
    "SYSTEM_DESIGN", "ARCHITECTURE", "AI_LLM", "LEADERSHIP", "CULTURE",
  ]),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "SENIOR", "STAFF"]),
  question: z.string().max(1_000),
  whyAsked: z.string().max(1_000),
  relatedRequirement: z.string().max(300),
  expectedTopics: z.array(z.string().max(300)).max(10),
  answerStructure: z.array(z.string().max(300)).max(10),
  /** Achievement ids the answer can draw on; checked before saving. */
  evidenceIds: z.array(evidenceRefSchema).max(20),
  followUps: z.array(z.string().max(300)).max(5),
  commonMistakes: z.array(z.string().max(300)).max(5),
  /** Topics to read; code keeps only plain topic names, never URLs. */
  resources: z.array(z.string().max(200)).max(5),
});

export const interviewPrepSchema = z.object({
  ...schemaMeta,
  task: z.literal("interview_preparation"),
  role: z.string().max(300),
  questions: z.array(interviewQuestionSchema).max(60),
  preparationTopics: z.array(z.string().max(300)).max(20),
  readiness: z.object({
    score: z.number().min(0).max(100).nullable(),
    confidence: confidence,
    reasoning: z.string().max(1_000),
  }),
});
export type InterviewPrep = z.output<typeof interviewPrepSchema>;

/** The interviewer's verdict on one mock-interview answer (master.md §7.5). */
export const mockFeedbackSchema = z.object({
  ...schemaMeta,
  task: z.literal("mock_feedback"),
  technicalAccuracy: z.number().min(0).max(100),
  structure: z.number().min(0).max(100),
  depth: z.number().min(0).max(100),
  communication: z.number().min(0).max(100),
  evidenceUse: z.number().min(0).max(100),
  strengths: z.array(z.string().max(500)).max(5),
  improvements: z.array(z.string().max(500)).max(5),
  suggestedAnswerPoints: z.array(z.string().max(300)).max(8),
});
export type MockFeedback = z.output<typeof mockFeedbackSchema>;

// ── Company research (master.md Phase 9) ─────────────────────────────────────

export const companyFactSchema = z.object({
  fact: z.string().max(1_000),
  /** Where it was seen, only from the research notes given; "" when interpretation. */
  sourceUrl: z.string().max(500),
  /** CONFIRMED (in the notes with a source) or INTERPRETATION (the model's reading). */
  kind: z.enum(["CONFIRMED", "INTERPRETATION"]),
});

export const companyResearchSchema = z.object({
  ...schemaMeta,
  task: z.literal("company_research"),
  overview: z.string().max(4_000),
  products: z.array(companyFactSchema).max(10),
  techStack: z.array(z.string().max(200)).max(20),
  engineeringCulture: z.array(companyFactSchema).max(10),
  recentDevelopments: z.array(companyFactSchema).max(10),
  funding: z.string().max(1_000),
  companySize: z.string().max(200),
  locations: z.array(z.string().max(200)).max(10),
  remotePolicy: z.string().max(1_000),
  whyCompany: z.string().max(2_000),
  whyRole: z.string().max(2_000),
  checklist: z.array(z.string().max(300)).max(10),
  questionsToAsk: z.array(z.string().max(300)).max(10),
});
export type CompanyResearchResult = z.output<typeof companyResearchSchema>;

// ── Learning plan (master.md Phase 8) ────────────────────────────────────────

export const learningPlanSchema = z.object({
  ...schemaMeta,
  task: z.literal("learning_plan"),
  goal: z.string().max(1_000),
  topics: z
    .array(
      z.object({
        title: z.string().max(300),
        prerequisites: z.array(z.string().max(300)).max(5),
        effortHours: z.number().min(1).max(40),
        exercises: z.array(z.string().max(500)).max(5),
        miniProjects: z.array(z.string().max(500)).max(3),
        interviewQuestions: z.array(z.string().max(500)).max(5),
        /** Resource topics to search for, never invented URLs. */
        resources: z.array(z.string().max(200)).max(5),
      }),
    )
    .max(15),
});
export type LearningPlanResult = z.output<typeof learningPlanSchema>;

// ── Knowledge-base review (master.md §1.3) ───────────────────────────────────

export const docFindingsSchema = z.object({
  ...schemaMeta,
  task: z.literal("knowledge_doc_review"),
  findings: z
    .array(
      z.object({
        id: z.string().max(60),
        kind: z.enum(["MISSING_METRIC", "UNCLEAR_RESPONSIBILITY", "UNEVIDENCED_TECH", "NO_BUSINESS_CONTEXT", "NO_MEASURABLE_OUTCOME", "DATE_CONFLICT", "DUPLICATE", "OTHER"]),
        note: z.string().max(1_000),
        /** The text it refers to, quoted from the document. */
        quote: z.string().max(500),
        /** An achievement it may duplicate, by title; "" when none. */
        duplicateOf: z.string().max(300),
      }),
    )
    .max(30),
  /** Achievement drafts to confirm, none of them verified yet (master.md §13). */
  achievements: z
    .array(
      z.object({
        title: z.string().max(300),
        description: z.string().max(2_000),
        technologies: z.array(z.string().max(100)).max(15),
        /** Status always comes out IMPORTED: the user verifies, never the model. */
        company: z.string().max(200),
        metrics: z.array(z.string().max(300)).max(5),
      }),
    )
    .max(20),
});
export type DocFindings = z.output<typeof docFindingsSchema>;
