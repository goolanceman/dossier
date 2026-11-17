/** The settings sections, in order (PRD §6.8). */
export const SETTINGS_SECTIONS = [
  { id: "ai", label: "AI provider" },
  { id: "ai-routing", label: "AI models & usage" },
  { id: "jobs", label: "Job search" },
  { id: "scoring", label: "Scoring" },
  { id: "agent", label: "Job agent" },
  { id: "automation", label: "Automation" },
  { id: "documents", label: "Documents" },
  { id: "google", label: "Google" },
  { id: "connector", label: "MCP connector" },
  { id: "data", label: "Your data" },
  { id: "about", label: "About" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** The section in `?section=`, or AI provider when it's missing or unknown; "claude" is the MCP connector's old name (#281). */
export function settingsSectionFromParam(value: string | string[] | undefined): SettingsSectionId {
  if (value === "claude") return "connector";
  return SETTINGS_SECTIONS.find((section) => section.id === value)?.id ?? "ai";
}

export const settingsSectionHref = (id: SettingsSectionId) => `/settings?section=${id}`;

/**
 * The AI tasks one routing row shows (master.md §11.3), in display order:
 * every getProviderForTask() call in the app. Each row follows the app's AI
 * provider for everything the task's own AiTaskConfig row doesn't set.
 */
export const ROUTING_TASKS = [
  {
    key: "screen-posting",
    label: "Posting screen",
    description: "The discovery pipeline's cheap screen: decides which new postings are worth a full assessment.",
  },
  {
    key: "assess-job",
    label: "Job assessment",
    description: "The deep pass on a shortlisted posting: fit score, requirement evidence and the job critique.",
  },
  {
    key: "salary-research",
    label: "Salary research",
    description: "Researches what a role pays, from the posting and public sources.",
  },
  {
    key: "gap-questions",
    label: "Gap questions",
    description: "Asks the questions worth answering before a strong application is written.",
  },
  {
    key: "resume-critique",
    label: "Resume critique",
    description: "Critiques the base resume for ATS, writing quality and recruiter impact.",
  },
  {
    key: "doc-findings",
    label: "Evidence findings",
    description: "Turns raw career notes into checked achievement entries for the evidence library.",
  },
  {
    key: "interview-prep",
    label: "Interview prep",
    description: "Builds an interview plan with likely questions and STAR answers for a posting.",
  },
  {
    key: "mock-feedback",
    label: "Mock interview feedback",
    description: "Scores mock interview answers and says what to improve.",
  },
  {
    key: "learning-plan",
    label: "Learning plan",
    description: "Turns the skill gaps an assessment found into a learning plan.",
  },
  {
    key: "company-research",
    label: "Company research",
    description: "Researches a company before you apply or interview.",
  },
] as const;

/** The task keys, for the actions' schemas and the routing rows. */
export const TASK_KEYS = ROUTING_TASKS.map((task) => task.key);
export type TaskKey = (typeof ROUTING_TASKS)[number]["key"];
