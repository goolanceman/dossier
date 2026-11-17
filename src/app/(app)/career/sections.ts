/** The career sections, in order (master.md Phase 1: evidence, targets, knowledge base). */
export const CAREER_SECTIONS = [
  { id: "achievements", label: "Achievements" },
  { id: "targets", label: "Targets" },
  { id: "knowledge", label: "Knowledge base" },
] as const;

export type CareerSectionId = (typeof CAREER_SECTIONS)[number]["id"];

/** The section in `?section=`, or Achievements when it's missing or unknown. */
export function careerSectionFromParam(value: string | string[] | undefined): CareerSectionId {
  return CAREER_SECTIONS.find((section) => section.id === value)?.id ?? "achievements";
}

export const careerSectionHref = (id: CareerSectionId) => `/career?section=${id}`;
