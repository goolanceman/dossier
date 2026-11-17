// The AI tasks of PRD §7 (E6-5). Each takes a provider, its input and the
// task options, and returns its data with the prompt version to save.
export { EXTRACT_POSTING_VERSION, extractPosting } from "./extract-posting";
export { EXTRACT_PROFILE_VERSION, extractProfile } from "./extract-profile";
export { MATCH_REQUIREMENTS_VERSION, matchRequirements } from "./match-requirements";
export type { TaskOptions, TaskResult } from "./prompt-parts";
export { REFINE_CHAT_VERSION, refineChat, type ChatTurn, type Refinement } from "./refine-chat";
export { REGENERATE_UNIT_VERSION, regenerateUnit } from "./regenerate-unit";
export { TAILOR_RESUME_VERSION, tailorResume } from "./tailor-resume";
export { WRITE_COVER_LETTER_VERSION, writeCoverLetter } from "./write-cover-letter";
export { WRITE_EMAIL_VERSION, writeEmail } from "./write-email";
export { CLASSIFY_REPLY_VERSION, classifyReply, type Classified } from "./classify-reply";
export { DRAFT_REPLY_VERSION, draftReply, type DraftedReply } from "./draft-reply";
export { SCORE_POSTING_VERSION, scorePosting, type PostingScore } from "./score-posting";
export { SCREEN_POSTING_VERSION, screenPosting, screenPostingFrom, type ScreenAnswer, type ScreenInput, type ScreenPosting } from "./screen-posting";
export { ASSESS_JOB_VERSION, assessJob, assessmentFrom, type AssessJobInput, type JobAssessmentAnswer } from "./assess-job";
export { SALARY_RESEARCH_VERSION, salaryResearch, salaryResearchFrom, type SalaryResearchAnswer, type SalaryResearchInput } from "./salary-research";
export { RESUME_CRITIQUE_VERSION, resumeCritique, critiqueFrom, type ResumeCritiqueAnswer, type ResumeCritiqueInput } from "./resume-critique";
export { GAP_QUESTIONS_VERSION, gapQuestions, gapQuestionsFrom, type GapQuestionsAnswer, type GapQuestionsInput } from "./gap-questions";
export { INTERVIEW_PREP_VERSION, interviewPrep, interviewPrepFrom, type InterviewPrepAnswer, type InterviewPrepInput } from "./interview-prep";
export { MOCK_FEEDBACK_VERSION, mockFeedback, mockFeedbackFrom, type MockFeedbackAnswer, type MockFeedbackInput } from "./mock-feedback";
export { COMPANY_RESEARCH_VERSION, companyResearch, companyResearchFrom, type CompanyResearchAnswer, type CompanyResearchInput } from "./company-research";
export { LEARNING_PLAN_VERSION, learningPlan, learningPlanFrom, type LearningPlanAnswer, type LearningPlanInput } from "./learning-plan";
export { DOC_FINDINGS_VERSION, docFindings, docFindingsFrom, type DocFindingsAnswer, type DocFindingsInput } from "./doc-findings";
export { APPLY_FINDINGS_VERSION, applyFindings, applyFindingsFrom, type ApplyFindingsAnswer, type ApplyFindingsInput } from "./apply-findings";
export { CAREER_PLAN_VERSION, careerPlan, careerPlanFrom, type CareerPlanAnswer, type CareerPlanInput } from "./career-plan";
