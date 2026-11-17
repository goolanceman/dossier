// A stand-in for an OpenAI-compatible AI server (E11-2), started by
// playwright.config.ts. It answers each task by its JSON schema's name with
// plausible output built from the prompt, like the mock provider in the unit
// tests, so the app's real provider code runs end to end.

import { createServer } from "node:http";

type Message = { role: string; content: string };
type Request = { messages: Message[]; response_format?: { json_schema?: { name?: string } } };

const port = Number(process.env.FAKE_AI_PORT ?? 3999);

/** The JSON after `label` in a message, up to the next blank line and label. */
function section(text: string, label: string): unknown {
  const start = text.indexOf(label);
  if (start < 0) return null;
  const rest = text.slice(start + label.length);
  const end = rest.search(/\n\n[A-Z][^\n]*:\n/);
  return JSON.parse(end < 0 ? rest : rest.slice(0, end));
}

/** The evidence library as the assessment and interview prompts carry it, so answers point at real ids. */
type EvidenceAchievement = { id: string; title: string; summary: string };
function achievementsOf(messages: Message[]): EvidenceAchievement[] {
  const content = messages[1]?.content ?? "";
  for (const label of [
    "The candidate's achievements, by id, that answers may point at as evidence:\n",
    "The candidate's achievements, by id, that answers can draw on:\n",
  ]) {
    const found = section(content, label);
    if (Array.isArray(found)) return found;
  }
  return [];
}

/** The achievement a spec can rely on: the one whose title says the payout flow redesign. */
function payoutEvidence(messages: Message[]): string | null {
  return achievementsOf(messages).find((achievement) => /payout flow redesign/i.test(achievement.title))?.id ?? null;
}

type Profile = {
  summary: string;
  skills: string[];
  experience: { id: string; bullets: string[] }[];
  projects: { id: string; bullets: string[] }[];
  education: { id: string; notes: string }[];
};
type Unit = { id: string; label: string; text: string };

/** Emails written so far, so writing again gives a different one. */
let emails = 0;
/** The last request's messages, for specs that check what a prompt carried (GET /last). */
let last: Message[] = [];

const answers: Record<string, (messages: Message[]) => unknown> = {
  extracted_posting: () => ({
    title: "Senior Product Designer, Payments · Ledgerly",
    company: "Ledgerly",
    role: "Senior Product Designer, Payments",
    location: "Amsterdam",
    mode: "Hybrid · 3 days in office",
    salary: "€75,000–€90,000",
    deadline: null,
    requirements: [
      { text: "5+ years of product design", kind: "years", skill: null, years: 5, language: null },
      { text: "Built or maintained a design system", kind: "skill", skill: "Design systems", years: null, language: null },
      { text: "Strong prototyping skills in Figma", kind: "skill", skill: "Figma", years: null, language: null },
      { text: "Experience with Kubernetes", kind: "skill", skill: "Kubernetes", years: null, language: null },
      { text: "Dutch is a plus", kind: "language", skill: null, years: null, language: "Dutch" },
    ],
    asksForReferences: false,
    language: "English",
  }),

  requirement_matches: (messages) => {
    const { requirements, candidateSkills, candidateLanguages } = JSON.parse(messages[1].content) as {
      requirements: { number: number; text: string; skill: string | null }[];
      candidateSkills: string[];
      candidateLanguages: string[];
    };
    return {
      matches: requirements.map((requirement) => ({
        requirement: requirement.number,
        skill: candidateSkills.find((name) => name.toLowerCase() === requirement.skill?.toLowerCase()) ?? null,
        language: candidateLanguages.find((name) => requirement.text.includes(name)) ?? null,
        certification: null,
      })),
    };
  },

  tailored_resume: (messages) => {
    const profile = section(messages[1].content, "The candidate's profile:\n") as Profile;
    return {
      summary: profile.summary,
      roles: profile.experience.map((entry) => ({ id: entry.id, bullets: entry.bullets })),
      projects: profile.projects.map((entry) => ({ id: entry.id, bullets: entry.bullets })),
      skills: profile.skills,
      education: profile.education.map((entry) => ({ id: entry.id, notes: entry.notes })),
    };
  },

  // The job agent's score (E16): by the posting's title, so a spec knows
  // which postings make the queue (70 is the default minimum) and which don't.
  posting_score: (messages) => {
    const { title } = section(messages[1].content, "The posting's facts:\n") as { title: string };
    const score = /senior product designer/i.test(title) ? 91 : /product designer/i.test(title) ? 78 : 45;
    return {
      score,
      reasons: [score >= 70 ? `The profile's product design roles match "${title}".` : `"${title}" is further from the profile's roles.`],
      redFlags: score >= 70 ? [] : ["The profile shows no UX research lead role."],
    };
  },

  cover_letter: () => ({
    recipient: "Ledgerly · Hiring team\nAmsterdam",
    greeting: "Dear Ledgerly team,",
    paragraphs: [
      { label: "Opening", text: "Payments are where trust is won or lost, and I'd love to help Ledgerly's customers feel calm about them." },
      { label: "Experience", text: "At Northwind Logistics I led the design of complex operational tools, from research to shipped flows." },
      { label: "Closing", text: "I'd be glad to talk about how I could help your Payments team." },
    ],
    signOff: "Warm regards,",
  }),

  application_email: () => ({
    contactName: "John Doe",
    contactEmail: "careers@example.com",
    subject: "Application: Senior Product Designer, Payments",
    greeting: "Dear John,",
    paragraphs: [
      emails++ === 0
        ? "I'm applying for the Senior Product Designer role on your Payments team."
        : "I'd love to help Ledgerly's customers feel calm about their payments as your Senior Product Designer.",
      "I've designed complex operational tools end to end, from research to shipped flows.",
      "My resume and cover letter are attached. I'd be glad to talk.",
    ],
    signOff: "Warm regards,",
  }),

  refinement: (messages) => {
    const request = messages.at(-1)!.content;
    if (/kubernetes/i.test(request)) {
      return { reply: "Your profile doesn't mention Kubernetes, so I left it out. Add it to your profile first.", edits: [], tone: null, declined: true };
    }
    if (request.includes("(I'm looking at the email.)")) {
      const email = section(messages[1].content, "The email's units:\n") as Unit[];
      const body = email.find((unit) => unit.id === "body")!;
      // Without the middle paragraph.
      const shorter = body.text.split("\n\n").filter((_, index) => index !== 2).join("\n\n");
      return { reply: "Done. I made the email shorter.", edits: [{ document: "EMAIL", unitId: "body", text: shorter }], tone: null, declined: false };
    }
    const resume = section(messages[1].content, "The resume's units:\n") as Unit[];
    const summary = resume.find((unit) => unit.id === "summary")!;
    const shorter = summary.text.split(/(?<=\.)\s+/)[0];
    return { reply: "Done. I made the summary shorter.", edits: [{ document: "RESUME", unitId: "summary", text: shorter }], tone: null, declined: false };
  },

  extracted_profile: () => ({
    basics: {
      name: "John Doe",
      headline: "Design Lead",
      email: "robin@example.com",
      phone: null,
      dob: null,
      website: null,
      address: null,
      city: "Utrecht",
      country: null,
      linkedin: null,
      summary: null,
    },
    skills: ["Figma", "Service design"],
    languages: [{ name: "Dutch", level: "NATIVE" }],
    experience: [
      {
        role: "Design Lead",
        company: "Acme Payments",
        location: "Utrecht",
        descriptor: "Payouts for online marketplaces, 60 people",
        volunteering: false,
        startYear: 2021,
        startMonth: 3,
        endYear: null,
        endMonth: null,
        current: true,
        bullets: ["Led the redesign of the payout flow"],
        skills: ["Service design"],
      },
    ],
    projects: [],
    education: [],
    certifications: [],
    publications: [],
    references: [],
  }),

  // Gmail (E15): an employer's reply is an invitation that asks two things,
  // and the answer offers the times it's given and leaves the notice period open.
  classified_reply: () => ({
    kind: "INTERVIEW",
    summary: "Invites you to a 45-minute call next week and asks about your notice period.",
    questions: ["Which times would work for you?", "What is your notice period?"],
    confirmedTime: null,
    unrelated: false,
  }),

  reply_draft: (messages) => {
    const times = (messages.at(-1)?.content ?? "").split("\n").filter((line) => line.startsWith("• "));
    return {
      greeting: "Hi John,",
      paragraphs: [
        times.length > 0 ? `Thank you, I'd be glad to talk. Any of these times works for me:\n${times.join("\n")}` : "Thank you, I'd be glad to talk.",
        "My notice period is […].",
      ],
      signOff: "Best regards,",
      gaps: ["What is your notice period?"],
    };
  },

  new_text: (messages) => {
    const current = messages[1].content.split("Its current text:\n").at(-1) ?? "";
    const lines = current.split("\n").filter(Boolean);
    return { text: lines.length > 1 ? lines.reverse().join("\n") : `In short: ${current}` };
  },

  // ── Career intelligence (master.md Phase 20) ─────────────────────────────
  // Each answer validates against its zod contract in src/lib/ai/task-contracts.ts,
  // and stays honest: evidence ids come from the prompt's own library, figures
  // and sources only when the prompt carried them.

  // The pipeline's cheap first look (§2.4 stage 3): the fake sources' design
  // postings are worth a full look.
  screen_posting: () => ({
    schema_version: "1.0",
    task: "screen_posting",
    verdict: "SHORTLIST",
    reasons: ["The posting's design requirements match the profile's product design experience."],
    confidence: "HIGH",
  }),

  // The deep assessment (§3.2–3.3): requirement by requirement, pointing at
  // the library's own achievement when the prompt carries one. The stored
  // score is the app's weighted sum of the dimensions (75 with the default
  // weights), so a spec knows what to expect.
  job_assessment: (messages) => {
    const payout = payoutEvidence(messages);
    return {
      schema_version: "1.0",
      task: "job_assessment",
      decision: {
        recommendation: "APPLY_AFTER_PREPARATION",
        compatibilityScore: 82,
        confidence: "MEDIUM",
        mandatoryRejection: false,
        summary: "A strong match on product design fundamentals, with prototyping depth still to show.",
      },
      dimensions: {
        technicalSkills: 80,
        relevantExperience: 75,
        responsibilities: 80,
        architecture: 60,
        seniority: 80,
        domain: 40,
        locationRemote: 90,
        employmentConditions: 60,
      },
      requirements: [
        {
          requirement: "5+ years of product design",
          importance: "REQUIRED",
          status: payout ? "STRONG_EVIDENCE" : "PARTIAL_EVIDENCE",
          evidenceIds: payout ? [payout] : [],
          jdQuotes: ["5+ years of product design"],
          explanation: payout
            ? "The library's payout flow redesign shows senior design work over years."
            : "The profile shows design experience, but no achievement in the library backs the years.",
          confidence: "HIGH",
        },
        {
          requirement: "Strong prototyping skills in Figma",
          importance: "REQUIRED",
          status: "MISSING_EVIDENCE",
          evidenceIds: [],
          jdQuotes: ["Strong prototyping skills in Figma"],
          explanation: "Nothing in the profile or the library shows prototyping in Figma.",
          confidence: "MEDIUM",
        },
      ],
      strengths: ["The payout flow redesign matches this role's payments domain."],
      gaps: ["No verified evidence of prototyping in Figma."],
      transferableSkills: [],
      risks: [],
      nextActions: ["Answer the gap questions on prototyping before applying."],
    };
  },

  // Salary research (Phase 4): the e2e wiring passes no research notes and no
  // allowed URLs, so the honest answer is that nothing is known: no figures,
  // no sources, nothing invented.
  salary_research: () => ({
    schema_version: "1.0",
    task: "salary_research",
    status: "UNAVAILABLE",
    minimum: null,
    median: null,
    maximum: null,
    currency: "EUR",
    basis: "ANNUAL",
    confidence: "LOW",
    sources: [],
    methodology: "The research notes given were empty, so there was nothing to read a figure from.",
  }),

  // The resume critique (§5.1–5.2): three findings across severities, and an
  // overall score the app labels an internal diagnostic estimate.
  resume_critique: () => ({
    schema_version: "1.0",
    task: "resume_critique",
    overall: {
      score: 64,
      atsReadiness: "FAIR",
      summary: "The resume reads well but states duties rather than results; the numbers are what would change it most.",
    },
    findings: [
      {
        id: "F1",
        category: "CONTENT",
        severity: "CRITICAL",
        title: "The payout redesign carries no metric",
        currentProblem: "The redesign of the merchant payout flow names no outcome, so a reader can't tell what changed.",
        recommendation: "Add the number the redesign moved, such as error rate or payout time, with where it was measured.",
        expectedImpact: "A measurable result makes the resume's strongest claim specific.",
        effort: "LIGHT",
        evidenceRequired: ["The metric the payout redesign moved, and where it was measured"],
        relatedJobRequirements: ["5+ years of product design"],
        confidence: "HIGH",
      },
      {
        id: "F2",
        category: "ATS",
        severity: "HIGH",
        title: "Section headings a scanner may miss",
        currentProblem: "The resume's sections aren't named the standard way, so an ATS may file experience under the wrong heading.",
        recommendation: "Use the standard headings: Experience, Projects, Education, Skills.",
        expectedImpact: "The scanner keeps every role with the dates it needs.",
        effort: "LIGHT",
        evidenceRequired: [],
        relatedJobRequirements: [],
        confidence: "MEDIUM",
      },
      {
        id: "F3",
        category: "WRITING",
        severity: "MEDIUM",
        title: "Duties where results should be",
        currentProblem: "Several bullets state what the role covered day to day rather than what changed because of it.",
        recommendation: "Rewrite two bullets as what changed, each with the number it moved.",
        expectedImpact: "The six-second recruiter read lands on results, not duties.",
        effort: "MEDIUM",
        evidenceRequired: ["One number per rewritten bullet"],
        relatedJobRequirements: ["Strong prototyping skills in Figma"],
        confidence: "MEDIUM",
      },
    ],
    keywordCoverage: ["product design", "Figma", "payments"],
    formattingIssues: ["The skills list mixes tools and levels in one line."],
    strengths: ["The summary names the domain, payments, in its first sentence."],
  }),

  // Gap questions (Phase 6): what the profile doesn't answer. alreadyKnown is
  // false throughout, so the app's cleaning keeps both.
  gap_questions: () => ({
    schema_version: "1.0",
    task: "gap_questions",
    questions: [
      {
        id: "q1",
        question: "What did the payout redesign change for merchants, as a number you can share?",
        reason: "The library's payout redesign has no metric, and the posting asks for results.",
        relatedRequirement: "5+ years of product design",
        expectedInformation: ["The number the redesign moved, and how it was measured"],
        questionType: "METRICS",
        priority: "HIGH",
        alreadyKnown: false,
      },
      {
        id: "q2",
        question: "Which part of a design system did you maintain yourself, and what did you change?",
        reason: "The posting asks for design system work; the profile names none.",
        relatedRequirement: "Strong prototyping skills in Figma",
        expectedInformation: ["The components you owned and one change you made"],
        questionType: "TECHNICAL",
        priority: "MEDIUM",
        alreadyKnown: false,
      },
    ],
  }),

  // Interview preparation (Phase 7): three predicted questions across stages,
  // one of them drawing on the library's achievement.
  interview_preparation: (messages) => {
    const payout = payoutEvidence(messages);
    return {
      schema_version: "1.0",
      task: "interview_preparation",
      role: "Senior Product Designer",
      questions: [
        {
          id: "q1",
          category: "RECRUITER",
          difficulty: "BEGINNER",
          question: "Walk me through your background and why this role fits it.",
          whyAsked: "The recruiter screen checks that the story matches the resume.",
          relatedRequirement: "",
          expectedTopics: ["The role you're aiming at", "Why payments"],
          answerStructure: ["Your present role", "The payout flow redesign", "Why this team"],
          evidenceIds: [],
          followUps: ["Which team are you leaving, and why?"],
          commonMistakes: ["Re-reading the resume instead of telling the story"],
          resources: [],
        },
        {
          id: "q2",
          category: "TECHNICAL",
          difficulty: "INTERMEDIATE",
          question: "How do you decide what to prototype first when a flow is complex?",
          whyAsked: "The role's core work is prototyping complex flows.",
          relatedRequirement: "Strong prototyping skills in Figma",
          expectedTopics: ["Risk first", "Fidelity by question"],
          answerStructure: ["Name the question the prototype answers", "Pick the smallest fidelity that answers it"],
          evidenceIds: payout ? [payout] : [],
          followUps: ["When has a prototype misled you?"],
          commonMistakes: ["Naming tools instead of decisions"],
          resources: ["prototyping fidelity"],
        },
        {
          id: "q3",
          category: "SYSTEM_DESIGN",
          difficulty: "ADVANCED",
          question: "Design a dashboard merchants use to reconcile thousands of payouts a day.",
          whyAsked: "The team's product is payouts at scale.",
          relatedRequirement: "",
          expectedTopics: ["Information hierarchy", "Error states"],
          answerStructure: ["The merchant's job to be done", "The one number to surface first"],
          evidenceIds: [],
          followUps: ["What breaks at ten times the volume?"],
          commonMistakes: ["Jumping to visuals before the job"],
          resources: ["dashboard hierarchy"],
        },
      ],
      preparationTopics: ["Payments flows", "Prototyping decisions"],
      readiness: { score: null, confidence: "LOW", reasoning: "The library has one verified achievement, too thin to score readiness on." },
    };
  },

  // The interviewer's verdict on one mock answer (§7.5): fixed dimension
  // scores, so a session's score is always round((72+70+66+78+80)/5) = 73.
  mock_feedback: () => ({
    schema_version: "1.0",
    task: "mock_feedback",
    technicalAccuracy: 72,
    structure: 70,
    depth: 66,
    communication: 78,
    evidenceUse: 80,
    strengths: ["The answer stayed on the question and named a concrete flow."],
    improvements: ["Close with the number the redesign moved, so the result is measurable."],
    suggestedAnswerPoints: [
      "Open with the situation: payouts arrived late and unexplained.",
      "Name your own part in the redesign.",
      "Close with the measured result.",
    ],
  }),

  // Company research (Phase 9): no notes and no allowed URLs in the e2e run,
  // so every fact is the model's reading, with an empty sourceUrl.
  company_research: () => ({
    schema_version: "1.0",
    task: "company_research",
    overview: "The research notes given were empty, so nothing here is confirmed: what follows is a reading of the job at hand only.",
    products: [{ fact: "A payments dashboard for marketplace sellers is the product this role works on.", sourceUrl: "", kind: "INTERPRETATION" }],
    techStack: [],
    engineeringCulture: [{ fact: "The posting's emphasis on prototyping suggests a team that ships and measures.", sourceUrl: "", kind: "INTERPRETATION" }],
    recentDevelopments: [],
    funding: "",
    companySize: "",
    locations: [],
    remotePolicy: "",
    whyCompany: "The payments domain matches the payout redesign in your library, so the work builds on what you can already prove.",
    whyRole: "The role asks for the complex-flow prototyping your redesign demonstrates.",
    checklist: ["Check the company's own site for what the payments team ships now."],
    questionsToAsk: ["What is the payments team's current top priority?"],
  }),

  // Learning plan (Phase 8): two topics, the second building on the first.
  learning_plan: () => ({
    schema_version: "1.0",
    task: "learning_plan",
    goal: "Close the gaps between your library and the target role",
    topics: [
      {
        title: "Payments fundamentals for designers",
        prerequisites: [],
        effortHours: 6,
        exercises: ["Map a payout flow end to end, from charge to settlement."],
        miniProjects: ["Sketch a reconciliation screen for a marketplace seller."],
        interviewQuestions: ["Where do payment flows usually break for merchants?"],
        resources: ["payments primer"],
      },
      {
        title: "Measuring design work",
        prerequisites: ["Payments fundamentals for designers"],
        effortHours: 4,
        exercises: ["Add one measurable outcome to an achievement in your library."],
        miniProjects: [],
        interviewQuestions: [],
        resources: [],
      },
    ],
  }),

  // Knowledge-base review (§1.3): findings that quote the document for real
  // (the app drops quotes it can't find again), and one draft achievement,
  // which lands as Imported (unverified).
  knowledge_doc_review: () => ({
    schema_version: "1.0",
    task: "knowledge_doc_review",
    findings: [
      {
        id: "D1",
        kind: "MISSING_METRIC",
        note: "The redesign says it was led but gives no number for what changed.",
        quote: "I led the redesign of the merchant payout flow, working with research and compliance.",
        duplicateOf: "",
      },
      {
        id: "D2",
        kind: "UNEVIDENCED_TECH",
        note: "Kafka is named without anything it was used for.",
        quote: "We used Kafka, Postgres and React.",
        duplicateOf: "",
      },
    ],
    achievements: [
      {
        title: "Delivered the new payout dashboard",
        description: "Delivered the new payout dashboard for the merchant payouts team.",
        technologies: ["Kafka", "Postgres", "React"],
        company: "Ledgerly Payments",
        metrics: [],
      },
    ],
  }),
};

createServer((request, response) => {
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.method === "GET" && request.url === "/health") return send(200, { ok: true });
  if (request.method === "GET" && request.url === "/last") return send(200, { messages: last });
  if (request.method === "GET" && request.url === "/v1/models") {
    return send(200, { object: "list", data: [{ id: "fake-model", object: "model", created: 0, owned_by: "e2e" }] });
  }
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") return send(404, { error: { message: "Not found" } });

  let raw = "";
  request.on("data", (chunk) => (raw += chunk));
  request.on("end", () => {
    const body = JSON.parse(raw) as Request;
    last = body.messages;
    const name = body.response_format?.json_schema?.name;
    const answer = name && answers[name];
    if (!answer) return send(400, { error: { message: `No fake answer for "${name}".` } });
    // A moment of "thinking", so progress shows as it would.
    setTimeout(() => {
      try {
        send(200, {
          id: "fake",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "fake-model",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(answer(body.messages)) }, finish_reason: "stop" }],
          // The same for every answer, for the Usage screen to add up (#290).
          usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
        });
      } catch (error) {
        send(500, { error: { message: String(error) } });
      }
    }, 300);
  });
}).listen(port, () => console.log(`Fake AI server on http://localhost:${port}`));
