import { resumeContent, type ResumeContent } from "@/lib/resume-content";
import type { ProfileData } from "@/lib/profile";

// The base resume as plain text (master.md §5.1): what the critique and the
// career-plan tasks read when they work on the base resume rather than an
// uploaded file. Same content the printed resume shows, as flat lines.

/** A role or project block as its lines. */
function roleLines(role: ResumeContent["experience"][number], heading: string): string[] {
  return [
    `${heading}: ${[role.role, role.company].filter(Boolean).join(" at ")}`,
    ...(role.dates ? [role.dates] : []),
    ...role.bullets.map((bullet) => `- ${bullet.trim()}`),
    role.skills.length > 0 ? `Skills: ${role.skills.join(", ")}` : "",
  ].filter((line) => line.trim() !== "");
}

/** The resume's text: the same sections the document shows, in the same order. */
export function resumeText(content: ResumeContent): string {
  return [
    [content.name, content.headline].filter(Boolean).join(" — "),
    content.contacts.join(" · "),
    content.summary.trim(),
    ...content.experience.flatMap((role) => roleLines(role, "Experience")),
    ...content.volunteering.flatMap((role) => roleLines(role, "Volunteering")),
    ...content.projects.flatMap((project) =>
      roleLines({ id: project.id, role: project.name, company: project.link, descriptor: "", dates: project.dates, bullets: project.bullets, skills: project.skills }, "Project"),
    ),
    content.skills.trim() ? `Skills: ${content.skills.trim()}` : "",
    ...content.education.map((entry) =>
      line([`Education: ${[entry.degree, entry.school].filter(Boolean).join(", ")}`, entry.dates, entry.notes].filter(Boolean).join(" — ")),
    ),
    ...content.certifications.map((entry) => line(`Certification: ${[entry.name, entry.issuer].filter(Boolean).join(", ")}${entry.date ? ` (${entry.date})` : ""}`)),
    ...content.publications.map((entry) => line(`Publication: ${entry.citation}`)),
    content.languages.trim() ? `Languages: ${content.languages.trim()}` : "",
  ]
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
}

/** The base resume's text from the profile, or from tailored units when they're given. */
export function profileResumeText(
  profile: ProfileData,
  { units, today = new Date() }: { units?: import("@/lib/application-data").Unit[]; today?: Date } = {},
): string {
  return resumeText(resumeContent(profile, { units, includeReferences: false, today }));
}

function line(text: string): string {
  return text.trim();
}
