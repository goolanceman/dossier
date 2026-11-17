# MASTER IMPLEMENTATION PROMPT — DOSSIER CAREER INTELLIGENCE PLATFORM

## Project

**Repository:** https://github.com/AienTech/dossier

**Reference projects:**
- https://ftja.vercel.app/
- https://github.com/TaegyuJEONG/ftja
- https://koaches.app/
- https://github.com/mzupan/tech-resume

**Objective:** Transform the existing Dossier application into a comprehensive AI-powered Career Intelligence, Job Discovery, Resume Engineering and Interview Preparation Platform.

This is an enhancement of the existing Dossier product, NOT a new application.

---

# PHASE 0 — NON-NEGOTIABLE ENGINEERING RULES

Before writing any code, understand the entire existing codebase.

### 0.1 Repository inspection

Clone or inspect the existing repository and examine:

- Complete directory structure.
- package.json and dependency versions.
- Next.js application structure.
- All existing routes and pages.
- Components and design system.
- API routes and server actions.
- Services, repositories and utilities.
- Prisma schemas and migrations.
- PostgreSQL and SQLite compatibility.
- Existing AI provider abstractions.
- Existing prompts and response parsing.
- Existing job search providers.
- Existing job agent and scheduling.
- Existing profile and resume data structures.
- Existing PDF and DOCX generation.
- Existing application tracking.
- Existing MCP integration.
- Existing Google integrations.
- Existing tests and deployment configuration.

Inspect the actual source files, not just README documentation.

### 0.2 Create an architecture assessment

Before implementation, create:

`docs/CAREER_INTELLIGENCE_ARCHITECTURE_AUDIT.md`

Document:

1. Existing architecture.
2. Existing features and their locations.
3. Existing reusable components.
4. Existing database entities and relationships.
5. Existing AI abstraction and prompt architecture.
6. Existing job scraping and discovery mechanisms.
7. Existing limitations.
8. Proposed module architecture.
9. Existing functionality that can be extended.
10. New functionality that genuinely requires implementation.
11. Database changes.
12. API changes.
13. Frontend changes.
14. Migration and backward compatibility strategy.

Create a feature gap matrix:

| Feature | Existing implementation | Required enhancement | Action |
|---|---|---|---|
| Profile | Inspect | Evidence-based career profile | Extend |
| Job search | Inspect | Advanced discovery pipeline | Extend |
| Job agent | Inspect | Multi-stage AI evaluation | Extend |
| Resume builder | Inspect | Evidence-backed generation | Extend |
| ATS analysis | Inspect | Advanced ATS diagnostics | Extend |
| Interview preparation | Inspect | Complete interview intelligence | Build/extend |
| Salary intelligence | Inspect | Salary research and confidence | Build/extend |
| Skills gap | Inspect | Personalized learning plans | Build/extend |

Do not assume something is missing simply because it is not obvious in the UI.

### 0.3 Implementation rules

- Preserve all existing features.
- Do not create duplicate services or components.
- Do not replace the current architecture without a demonstrated reason.
- Prefer existing libraries and abstractions.
- Maintain PostgreSQL and SQLite compatibility.
- Preserve existing data and migrations.
- Use existing authentication and authorization.
- Use server-side AI calls.
- Never expose API keys in frontend code.
- Use Zod or existing validation conventions.
- Follow existing TypeScript conventions.
- Avoid unnecessary dependencies.
- Use reusable components.
- Keep business logic out of UI components.
- Implement proper loading, error, empty and success states.
- Add tests for every important workflow.
- Maintain existing deployment compatibility.

**Do not stop after the architecture report.** Once the audit is complete, proceed to implementation in logical phases. Do not ask for approval for ordinary engineering decisions. Ask only when an irreversible decision or missing external credential genuinely requires it.

---

# PHASE 1 — CAREER INTELLIGENCE CORE

Create a centralized career intelligence system that powers all other features.

## 1.1 Career profile

Extend the existing profile instead of creating another profile.

The profile must support:

- Personal information.
- Professional summary.
- Career objectives.
- Current and previous positions.
- Companies and employment dates.
- Responsibilities.
- Achievements.
- Technologies.
- Technical skills.
- Soft skills.
- Projects.
- Open-source contributions.
- Education.
- Certifications.
- Publications.
- Leadership experience.
- Domain experience.
- Industry experience.
- Team size and leadership scope.
- Architecture experience.
- Production systems experience.
- Quantified accomplishments.

Support multiple career directions.

Example:

- Senior Backend Engineer.
- Staff Backend Engineer.
- AI Backend Engineer.
- Node.js Architect.
- Python Backend Engineer.
- Engineering Manager.

Each target role should have its own preferences, priorities and requirements.

## 1.2 Evidence-backed achievement library

This is one of the most important features.

Create a reusable professional achievement library.

Every achievement should contain:

- Achievement title.
- Original description.
- Detailed explanation.
- Company.
- Position.
- Project.
- Technologies.
- Problem addressed.
- Action taken.
- Outcome.
- Business impact.
- Metrics, if verified.
- Scale.
- Ownership level.
- Complexity.
- Supporting evidence.
- Verification status.
- Tags.
- Related skills.
- Related experiences.

Support these evidence statuses:

- Verified.
- User confirmed.
- Imported, not verified.
- Needs clarification.
- Rejected.

Never silently promote an AI-generated claim into verified evidence.

Allow users to maintain multiple versions of a bullet:

- Technical.
- Business impact.
- Leadership.
- Concise ATS version.
- Detailed project version.

Maintain relationships between original facts and generated bullets.

AI must never turn an unverified statement into a factual achievement.

## 1.3 Career knowledge base

Allow importing:

- Existing resumes.
- LinkedIn profile exports.
- Project documentation.
- Technical documents.
- GitHub repositories.
- Personal notes.
- Existing achievement documents.
- Certifications.
- Performance reviews.

Extract information and present it for confirmation.

AI should identify:

- Missing metrics.
- Unclear responsibilities.
- Technologies mentioned without evidence.
- Projects lacking business context.
- Achievements lacking measurable outcomes.
- Conflicting employment dates.
- Duplicate achievements.

Build a unified career knowledge base.

Use the existing database and storage architecture. Introduce embeddings or vector search only where they provide measurable value.

---

# PHASE 2 — ADVANCED JOB DISCOVERY AND SCRAPING

Build a configurable, multi-source job discovery engine.

## 2.1 Job source integrations

Support a pluggable provider architecture.

Potential sources:

- Existing Dossier providers.
- JSearch.
- Adzuna.
- Apify actors.
- Custom Python scraper.
- Company career pages.
- Greenhouse job boards.
- Lever job boards.
- Ashby job boards.
- Workable.
- Remote job boards.
- Other configurable APIs.

Important: I already have my own remote scraper and use Apify for non-public job sources.

Design the integration to support:

1. Existing remote scraper through an HTTP API.
2. Apify through its API.
3. Existing Dossier providers.
4. Additional providers through adapters.

Do not couple the application to one scraper.

Each provider should implement a common interface:

- Search jobs.
- Fetch job details.
- Normalize job records.
- Return source metadata.
- Report errors.
- Report rate limits.
- Support pagination.
- Support retries.

Respect source terms, robots.txt where applicable, rate limits and applicable privacy requirements. Do not bypass authentication, CAPTCHAs or access restrictions.

Do not require LinkedIn cookies or login sessions for public job discovery.

## 2.2 Job search configuration

Allow users to create unlimited named search profiles.

Each profile should support:

- Search titles.
- Alternative titles.
- Required keywords.
- Excluded keywords.
- Required technologies.
- Preferred technologies.
- Excluded technologies.
- Experience range.
- Seniority.
- Employment type.
- Location.
- Remote preference.
- Countries where remote work is permitted.
- Salary minimum.
- Salary maximum.
- Salary currency.
- Company blacklist.
- Company whitelist.
- Industry preferences.
- Company size.
- Startup preference.
- Notice period compatibility.
- Sponsorship requirements.
- Time-zone compatibility.
- Search frequency.
- Maximum jobs per run.

Support multiple simultaneous search profiles.

Example:

Search A: Senior Node.js Backend Engineer.

Search B: Python/FastAPI Backend Engineer.

Search C: AI Backend Engineer.

Search D: Remote Staff Backend Engineer.

Each profile must have independent rules and execution history.

## 2.3 Scheduled discovery

Extend the existing job agent.

Support configurable schedules:

- Every hour.
- Every 6 hours.
- Daily.
- Selected weekdays.
- Custom cron expression.

Each run should:

1. Execute enabled providers.
2. Fetch jobs in batches.
3. Normalize job records.
4. Deduplicate jobs.
5. Apply deterministic filters.
6. Extract descriptions.
7. Execute AI assessment.
8. Store results.
9. Generate recommendations.
10. Notify the user.

Provide manual execution as well.

The scheduler must support:

- Time zones.
- Job locking.
- Retry policies.
- Failed-job recovery.
- Execution history.
- Cancellation.
- Concurrency limits.
- Rate limits.
- Duplicate-run prevention.

Use the existing scheduling infrastructure if available. Do not introduce a separate scheduler unnecessarily.

## 2.4 Intelligent filtering pipeline

Implement multiple filtering stages.

### Stage 0 — Ingestion

Fetch available job metadata.

### Stage 1 — Deterministic filtering

No AI required.

Filter by:

- Blacklisted companies.
- Excluded titles.
- Minimum salary.
- Location mismatch.
- Unsupported remote countries.
- Wrong employment type.
- Experience mismatch.
- Duplicate jobs.
- Expired postings.
- Invalid descriptions.

### Stage 2 — Lightweight keyword matching

Extract relevant sentences and surrounding context.

Compare:

- Required technologies.
- Preferred technologies.
- Job responsibilities.
- Experience requirements.
- Architecture requirements.
- Industry requirements.

Avoid passing every full job description into an expensive model.

### Stage 3 — Cheap AI screening

Use a configurable lightweight model.

Evaluate whether the job is worth deeper analysis.

### Stage 4 — Full JD assessment

Only shortlisted jobs reach the stronger model.

Provide:

- Complete JD.
- Relevant career profile.
- Verified achievement library.
- Search criteria.
- Evaluation rubric.

### Stage 5 — Final recommendation

Return:

- Strong match.
- Potential match.
- Weak match.
- Reject.

A rejection must include an explanation.

Never discard a job without recording the reason.

Every stage must be independently enabled or disabled.

---

# PHASE 3 — ADVANCED JOB DESCRIPTION INTELLIGENCE

Create a dedicated Job Intelligence page for each posting.

## 3.1 JD extraction

Extract structured information:

- Company.
- Job title.
- Department.
- Location.
- Remote/hybrid/on-site.
- Eligible countries.
- Employment type.
- Seniority.
- Experience required.
- Required technologies.
- Preferred technologies.
- Responsibilities.
- Mandatory qualifications.
- Optional qualifications.
- Salary.
- Benefits.
- Working hours.
- Time-zone requirements.
- Reporting structure.
- Application method.
- Application URL.
- Hiring manager information when publicly available.
- Original publication date.
- Expiry date.

Preserve the original JD.

Every extracted field should retain its source or confidence status.

## 3.2 Job compatibility analysis

Create a detailed evaluation engine.

Evaluate:

1. Technical skills.
2. Experience.
3. Seniority.
4. Responsibilities.
5. Architecture experience.
6. Industry experience.
7. Leadership.
8. Location.
9. Remote eligibility.
10. Salary.
11. Employment conditions.
12. Career alignment.

Display an overall compatibility score from 0–100.

The scoring formula must be configurable.

Example default weights:

| Dimension | Weight |
|---|---:|
| Technical skills | 25 |
| Relevant experience | 20 |
| Responsibilities | 15 |
| Architecture and system design | 10 |
| Seniority | 10 |
| Domain experience | 5 |
| Location and remote eligibility | 10 |
| Salary and employment conditions | 5 |

These are initial defaults, not fixed business logic.

Support mandatory rejection rules.

For example:

- Remote work is not permitted from the candidate's country.
- Salary is below the mandatory minimum.
- Required experience is substantially beyond the candidate's level.
- A required technology is genuinely missing.

A high numerical score must not override a mandatory rejection rule.

## 3.3 Evidence-based matching

For every JD requirement, display:

- Requirement.
- Importance.
- Evidence from the candidate's profile.
- Exact source achievement.
- Evidence strength.
- Confidence.
- Match status.
- Gap explanation.

Match statuses:

- Strong evidence.
- Partial evidence.
- Transferable experience.
- Missing evidence.
- Confirmed gap.
- Not applicable.

Important: transferable experience is not the same as direct experience.

Example:

JD requirement: Kubernetes production experience.

Candidate evidence: Production Docker and Kubernetes deployments, CI/CD pipelines and containerized distributed services.

Assessment: Strong or partial match depending on the verified evidence.

Never claim direct experience with something that only has an adjacent equivalent.

## 3.4 Detailed job critique

Generate a job-specific report covering:

- What makes the position attractive.
- Why the candidate is suitable.
- What the candidate lacks.
- Hidden requirements.
- Potential interview difficulty.
- Seniority mismatch.
- Potential concerns.
- Career progression.
- Salary competitiveness.
- Application recommendation.

Include a clear recommendation:

- Apply.
- Apply after preparation.
- Save for later.
- Reject.

Allow users to override AI decisions.

Record their reasoning to improve future recommendations, with explicit approval before changing criteria.

---

# PHASE 4 — SALARY INTELLIGENCE

Salary must not be hallucinated.

Create a dedicated salary research service.

When the JD does not state compensation:

1. Identify the company.
2. Identify the job title.
3. Identify the seniority.
4. Identify the country.
5. Identify the city or remote location.
6. Identify the employment type.
7. Research available salary sources.
8. Estimate a reasonable compensation range.

Consider:

- Company career pages.
- Public salary reports.
- Levels.fyi where relevant.
- Glassdoor.
- Indeed.
- Other trustworthy compensation sources.
- Publicly available salary datasets.

Store source URLs and retrieval dates.

Return:

- Minimum estimate.
- Median estimate.
- Maximum estimate.
- Currency.
- Annual/monthly/hourly basis.
- Geographic market.
- Confidence level.
- Source count.
- Supporting evidence.
- Estimation methodology.

Differentiate:

- Salary stated in JD.
- Salary publicly confirmed.
- Salary estimated from market data.
- Salary unavailable.

Never present an estimate as a confirmed company offer.

Allow salary preferences by target role and location.

---

# PHASE 5 — RESUME INTELLIGENCE ENGINE

This is a core feature, not merely an extension of the existing resume generator.

## 5.1 Resume critique

Allow users to upload:

- PDF.
- DOCX.
- Markdown.
- TXT.

Analyze:

### Content
- Professional summary.
- Experience.
- Achievements.
- Technical skills.
- Projects.
- Education.
- Certifications.

### ATS compatibility
- Document parsing.
- Section recognition.
- Keyword coverage.
- Formatting problems.
- Tables and text boxes.
- Headers and footers.
- Missing contact details.
- Dates and employment history.
- Unsupported formatting.

### Writing quality
- Generic statements.
- Weak action verbs.
- Repeated phrases.
- AI-sounding expressions.
- Unquantified claims.
- Excessive jargon.
- Long bullets.
- Redundant content.

### Recruiter perspective
- First 7-second impression.
- Relevant experience visibility.
- Seniority positioning.
- Technical credibility.
- Business impact.
- Differentiation.

## 5.2 Impact-ranked improvements

Every recommendation must have:

- Current problem.
- Why it matters.
- Suggested improvement.
- Expected impact.
- Effort.
- Evidence required.
- Priority.

Prioritize:

1. Critical.
2. High.
3. Medium.
4. Low.

Example:

Critical: The resume does not demonstrate production ownership despite the target role requiring it.

High: Recent achievements lack measurable scale.

Medium: Technical skills are not grouped by category.

Low: Minor wording improvements.

Never assign an artificial ATS score and present it as an actual employer screening result.

Explain that ATS compatibility scores are internal diagnostic estimates.

## 5.3 Evidence-backed bullet library

Use the centralized achievement library.

Each generated bullet must reference its original evidence.

Support:

- Multiple bullet versions.
- Company-specific achievements.
- Project-specific achievements.
- Metrics.
- Skills.
- Business outcomes.
- Technical outcomes.

AI may improve phrasing but must not invent:

- Numbers.
- Percentages.
- Performance improvements.
- Team sizes.
- Revenue.
- Responsibilities.
- Technologies.
- Dates.
- Job titles.

If a fact is missing, ask the user.

## 5.4 Targeted resume generation

For each selected job:

1. Read the complete JD.
2. Identify its most important requirements.
3. Find matching verified evidence.
4. Rank achievements.
5. Select relevant bullets.
6. Reorder experience.
7. Adapt the summary.
8. Optimize technical skills.
9. Validate word count.
10. Run ATS checks.
11. Run hallucination checks.
12. Generate DOCX/PDF.
13. Compare against the base resume.

Support configurable:

- One-page resume.
- Two-page resume.
- Maximum word count.
- Bullet limits.
- Summary length.
- Tone.
- Formatting.
- Template.
- Target seniority.
- Country-specific conventions.

Never silently remove important career information just to achieve a word limit.

Provide a change report.

## 5.5 Resume versioning

Maintain:

- Master resume.
- Target-role resumes.
- Company-specific resumes.
- Application-specific resumes.
- Previous versions.

Allow comparison and rollback.

Track which evidence was used in each version.

---

# PHASE 6 — INTELLIGENT GAP QUESTIONS

This is an essential part of the workflow.

After assessing a JD, identify areas where the candidate's experience is unclear.

Generate targeted questions.

Example:

JD requirement: High-throughput distributed systems.

Existing profile: Experience with Kafka, Redis and microservices.

AI should ask:

1. What approximate message volume did your Kafka systems process?
2. Did you design the partitioning and consumer scaling strategy?
3. What were the main bottlenecks?
4. How did you handle retries and message failures?
5. What measurable improvements did your implementation deliver?

Questions should be based on the candidate's actual profile and missing evidence.

Do not ask questions whose answers already exist in verified records.

Support:

- Technical questions.
- Achievement questions.
- Metrics questions.
- Leadership questions.
- Project questions.
- Business impact questions.
- Career clarification.

Batch questions intelligently.

Allow users to:

- Answer individually.
- Answer in bulk.
- Skip.
- Mark unknown.
- Save for later.

After confirmation, add new evidence to the career profile.

Preserve the original answer and its source.

Do not automatically modify previously verified facts.

---

# PHASE 7 — INTERVIEW INTELLIGENCE AND PREPARATION

Build a complete interview preparation module inspired by Koaches, expanded for technical engineering roles.

## 7.1 Interview question generator

Generate questions using:

- Full JD.
- Company information.
- Target role.
- Candidate profile.
- Skills gaps.
- Interview level.
- Job responsibilities.

Categories:

1. Recruiter screening.
2. HR.
3. Behavioral.
4. Hiring manager.
5. Technical fundamentals.
6. Programming.
7. Node.js.
8. Python.
9. FastAPI.
10. Distributed systems.
11. Microservices.
12. PostgreSQL.
13. MongoDB.
14. Redis.
15. Kafka.
16. AWS/cloud.
17. Docker/Kubernetes.
18. System design.
19. Architecture.
20. AI/LLM engineering.
21. RAG.
22. Agents.
23. Production AI systems.
24. Leadership.
25. Culture and collaboration.

Categories must be configurable.

## 7.2 Question difficulty

Support:

- Beginner.
- Intermediate.
- Advanced.
- Senior.
- Staff/Principal.

Include interview-round configuration.

Example:

Round 1: Recruiter.

Round 2: Backend technical.

Round 3: System design.

Round 4: Engineering manager.

Round 5: Culture and leadership.

## 7.3 Question response format

Every generated question must include:

- Question.
- Category.
- Difficulty.
- Why the interviewer may ask it.
- Related JD requirement.
- Expected answer topics.
- Relevant candidate experience.
- Suggested answer structure.
- Follow-up questions.
- Common mistakes.
- Evaluation criteria.

For technical questions, also include:

- Concept explanation.
- Example.
- Practical scenario.
- Code exercise where relevant.
- Production considerations.
- Further reading topics.

Do not claim these are the company's actual interview questions. Clearly label generated questions as predicted or representative.

## 7.4 STAR story bank

Build a reusable story bank.

Store:

- Situation.
- Task.
- Action.
- Result.
- Technologies.
- Business impact.
- Skills demonstrated.
- Related interview questions.

AI should identify opportunities to reuse existing stories.

Ask the candidate to provide missing details.

## 7.5 Mock interview

Support:

- Text interview.
- Voice interview if supported by the chosen provider.
- Timed interview.
- Technical interview.
- Behavioral interview.
- System design interview.

The AI interviewer should ask one question at a time.

Evaluate the response for:

- Technical accuracy.
- Completeness.
- Structure.
- Communication.
- Depth.
- Practical experience.
- Confidence of supporting evidence.

Provide constructive feedback.

Allow follow-up questions based on the candidate's answer.

## 7.6 Interview readiness

Create a readiness dashboard.

Display:

- Overall readiness.
- Technical readiness.
- Behavioral readiness.
- System design readiness.
- Skills gaps.
- Unanswered questions.
- Weak answers.
- Recommended preparation.

Readiness must be based on completed exercises and evidence, not arbitrary AI optimism.

---

# PHASE 8 — PERSONALIZED LEARNING AND STUDY PLANNER

For every job, create a personalized learning plan.

Example:

Target: Senior AI Backend Engineer.

Detected gaps:
- RAG architecture.
- Vector databases.
- Evaluation of LLM applications.
- Agent orchestration.
- Production model deployment.

Generate:

- Topics to learn.
- Prerequisites.
- Learning sequence.
- Estimated effort.
- Practical exercises.
- Mini-projects.
- Interview questions.
- Assessment questions.
- Relevant resources.

Support daily and weekly schedules.

Allow the candidate to mark topics:

- Not started.
- Learning.
- Practicing.
- Completed.
- Needs revision.

Do not generate an unrealistic study plan.

Prioritize skills that improve suitability for the selected role.

Track learning progress and reassess job readiness.

---

# PHASE 9 — COMPANY INTELLIGENCE

Create a company research module.

Research publicly available information:

- Company overview.
- Products.
- Industry.
- Technology stack.
- Engineering culture.
- Recent developments.
- Funding.
- Company size.
- Locations.
- Remote-work policy.
- Engineering leadership.
- Public technical articles.
- Public engineering blogs.

Generate:

- Why this company?
- Why this role?
- What to research before an interview?
- Potential questions to ask the interviewer.
- Company-specific preparation checklist.

All time-sensitive facts must include source URLs and retrieval dates.

Clearly distinguish confirmed information from AI-generated interpretation.

---

# PHASE 10 — APPLICATION INTELLIGENCE

Extend the existing application tracking system.

Each application should connect to:

- Original JD.
- Company.
- Job assessment.
- Salary research.
- Resume version.
- Cover letter.
- Gap questions.
- Interview preparation.
- Study plan.
- Company research.
- Communication history.
- Application status.

Suggested stages:

- Discovered.
- Shortlisted.
- Needs clarification.
- Preparing.
- Ready to apply.
- Applied.
- Recruiter screening.
- Technical interview.
- Hiring manager.
- Final round.
- Offer.
- Rejected.
- Withdrawn.
- Archived.

Support custom stages.

Add an application timeline.

Show every action and generated artifact.

Maintain the existing human-approval workflow.

Never submit applications automatically unless an explicitly enabled, separately approved integration supports that action.

Never send emails without confirmation.

---

# PHASE 11 — AI ARCHITECTURE AND MODEL ORCHESTRATION

This must be configurable centrally.

Do not hardcode a particular provider or model.

## 11.1 Provider support

Reuse existing Dossier provider integrations.

Support:

- Anthropic.
- OpenAI.
- Gemini.
- Mistral.
- DeepSeek.
- OpenRouter.
- Ollama.
- LM Studio.
- OpenAI-compatible APIs.

Only implement additional adapters where necessary.

## 11.2 Model selection by task

Allow different models for different tasks.

Example:

| Task | Model preference |
|---|---|
| Keyword extraction | Small/fast |
| JD classification | Cheap |
| Initial screening | Cheap |
| Detailed JD analysis | Strong |
| Salary research | Research-capable |
| Resume generation | Strong |
| Resume critique | Strong |
| Gap questions | Strong |
| Interview generation | Strong |
| Mock interview | Configurable |
| Embeddings | Dedicated embedding model |

Users must be able to change every selection.

Support fallback models.

If a provider fails, log the error and apply configured retry/fallback rules.

Never silently switch to a different provider without recording it.

## 11.3 Central AI configuration

Create an AI task configuration system.

For every task configure:

- Provider.
- Model.
- Temperature, if supported.
- Maximum output tokens.
- Timeout.
- Retry count.
- Fallback model.
- Context limit.
- Prompt version.
- Structured output schema.
- Enabled/disabled status.
- Maximum concurrent requests.

Provide a UI in Settings.

## 11.4 Cost and token optimization

Implement:

- Deterministic filtering.
- Context extraction.
- Shortlisting.
- Model routing.
- Prompt caching where supported.
- Result caching.
- Duplicate analysis prevention.
- Token usage logging.
- Cost estimation.
- Per-task budgets.
- Daily and monthly budgets.

Show:

- Input tokens.
- Output tokens.
- Cached tokens when available.
- Estimated cost.
- Provider.
- Model.
- Execution duration.
- Success/failure.

Allow budget limits and configurable stop behavior.

Do not fabricate token or cost metrics when providers do not supply them.

---

# PHASE 12 — STRICT AI RESPONSE CONTRACTS

This is critical.

Do not let the AI return arbitrary Markdown and then parse it using fragile string manipulation.

Use typed JSON responses validated by Zod.

Every AI operation must have:

1. A task-specific system prompt.
2. Explicit input schema.
3. Explicit output schema.
4. A structured response.
5. Validation.
6. Retry or repair handling.
7. Persistence.
8. Provenance.
9. Prompt version.
10. Model metadata.

Use JSON Schema or equivalent provider-supported structured output where available.

Never trust that a model follows instructions simply because JSON was requested.

## 12.1 JD assessment response

Use this logical structure:

{
  "schema_version": "1.0",
  "task": "job_assessment",
  "job": {
    "title": "Senior Backend Engineer",
    "company": "Example Company",
    "location": "Remote"
  },
  "decision": {
    "recommendation": "apply",
    "compatibility_score": 87,
    "confidence": "high",
    "mandatory_rejection": false,
    "summary": "Strong alignment with backend architecture requirements."
  },
  "criteria": [
    {
      "name": "Node.js",
      "importance": "required",
      "status": "strong_evidence",
      "evidence_ids": ["achievement_123"],
      "jd_quotes": ["Experience building Node.js services"],
      "explanation": "Verified production backend experience.",
      "confidence": 0.95
    }
  ],
  "strengths": [],
  "gaps": [],
  "transferable_skills": [],
  "risks": [],
  "salary": {
    "status": "estimated",
    "minimum": null,
    "maximum": null,
    "currency": "USD",
    "confidence": "low",
    "sources": []
  },
  "next_actions": [],
  "follow_up_questions": []
}

All arrays and fields must follow the actual Zod schema.

The example is illustrative, not permission to fabricate evidence.

## 12.2 Resume critique response

{
  "schema_version": "1.0",
  "task": "resume_critique",
  "overall_assessment": {
    "score": 0,
    "ats_readability": "good",
    "summary": ""
  },
  "findings": [
    {
      "id": "finding_001",
      "category": "experience",
      "severity": "critical",
      "title": "",
      "current_problem": "",
      "recommendation": "",
      "expected_impact": "",
      "evidence_required": [],
      "related_job_requirements": [],
      "confidence": "high"
    }
  ],
  "strengths": [],
  "keyword_coverage": [],
  "formatting_issues": [],
  "recommended_actions": []
}

## 12.3 Gap question response

{
  "schema_version": "1.0",
  "task": "gap_questions",
  "questions": [
    {
      "id": "question_001",
      "question": "",
      "reason": "",
      "related_requirement": "",
      "expected_information": [],
      "question_type": "technical",
      "priority": "high",
      "already_known": false
    }
  ]
}

## 12.4 Interview preparation response

{
  "schema_version": "1.0",
  "task": "interview_preparation",
  "role": "",
  "questions": [
    {
      "id": "interview_001",
      "category": "system_design",
      "difficulty": "advanced",
      "question": "",
      "why_asked": "",
      "related_requirement": "",
      "expected_topics": [],
      "answer_structure": [],
      "relevant_evidence_ids": [],
      "follow_up_questions": [],
      "common_mistakes": [],
      "resources": []
    }
  ],
  "preparation_topics": [],
  "readiness": {
    "score": null,
    "confidence": "low",
    "reasoning": ""
  }
}

## 12.5 General AI response rules

- Use null for unavailable information.
- Never invent evidence IDs.
- Never invent source URLs.
- Never invent salary data.
- Never claim an unsupported technology.
- Preserve source quotations exactly.
- Validate all evidence references against the database.
- Reject invalid enums and malformed responses.
- Handle incomplete model responses.
- Handle token limits.
- Support provider-specific structured outputs.
- Record model and prompt versions.

Keep prompts versioned and editable through an appropriate configuration interface.

---

# PHASE 13 — AI SAFETY AND HALLUCINATION PREVENTION

Treat this as a first-class requirement.

## Evidence hierarchy

1. User-confirmed facts.
2. Verified achievements.
3. Uploaded original documents.
4. Imported but unverified facts.
5. AI-generated interpretations.

AI-generated interpretations must never be treated as verified career facts.

## Hallucination validation

Before saving a generated resume:

- Validate each claim.
- Validate numbers.
- Validate dates.
- Validate technologies.
- Validate titles.
- Validate company names.
- Validate responsibilities.
- Validate achievement references.

Any unsupported claim must be rejected or sent back for user clarification.

Implement a claim-to-evidence mapping.

Each generated bullet should be traceable to one or more career evidence records.

Support a strict mode:

ONLY VERIFIED FACTS.

This should be the default for resume and cover letter generation.

## Prompt injection protection

Job descriptions, scraped pages, emails and imported documents are untrusted data.

Never allow instructions embedded in external job descriptions to override system prompts or request secrets.

Never execute code, shell commands or external actions based on scraped content.

---

# PHASE 14 — USER INTERFACE AND NAVIGATION

Extend the existing Dossier design system.

Do not create a disconnected dashboard or completely different visual language.

Create or extend the following navigation sections.

### Dashboard

- Career overview.
- New jobs discovered.
- Best matches.
- Jobs requiring review.
- Application pipeline.
- Interview schedule.
- Preparation progress.
- Salary insights.
- AI usage.
- Recommended next actions.

### Career Profile

- Professional profile.
- Experience.
- Achievements.
- Evidence library.
- Skills.
- Projects.
- Career objectives.
- Knowledge base.

### Job Discovery

- Job search.
- Search profiles.
- Saved jobs.
- Scraper sources.
- Scheduled runs.
- Discovery history.

### Job Intelligence

- Job details.
- Compatibility.
- Requirement mapping.
- Salary intelligence.
- Company research.
- Gap analysis.
- AI critique.
- Recommendation.

### Resume Intelligence

- Resume upload.
- Resume critique.
- Base resume.
- Achievement library.
- Tailored resumes.
- Resume comparison.
- ATS analysis.
- Resume history.

### Interview Preparation

- Interview dashboard.
- Question bank.
- STAR story bank.
- Mock interviews.
- Technical preparation.
- System design.
- Learning plans.
- Readiness.

### Applications

- Application board.
- Application details.
- Timeline.
- Documents.
- Communications.
- Interviews.
- Offers.

### AI Settings

- Provider management.
- Model routing.
- Prompt configuration.
- Token usage.
- Budgets.
- Execution history.
- Fallback configuration.

### Automation

- Scheduled searches.
- Job processing pipeline.
- Notifications.
- Daily digests.
- Automation history.

Use responsive layouts, meaningful empty states, filters, sorting, search, pagination and accessible controls.

Avoid overcrowded screens.

Provide clear drill-down navigation between related records.

---

# PHASE 15 — AUTOMATION AND DAILY DIGEST

Implement configurable daily reports.

Example workflow:

11:00 PM — Run enabled job searches.

11:10 PM — Normalize and deduplicate results.

11:20 PM — Apply deterministic filtering.

11:30 PM — Run lightweight AI screening.

12:00 AM — Evaluate shortlisted jobs using stronger models.

12:30 AM — Perform salary research where necessary.

1:00 AM — Generate detailed assessments.

1:30 AM — Generate preparation recommendations.

The actual execution schedule must be configurable. Do not assume that these durations will be fixed.

Daily digest should contain:

- Number of jobs discovered.
- Number rejected by deterministic filters.
- Number screened by AI.
- Number shortlisted.
- Best matching jobs.
- Match reasons.
- Missing requirements.
- Salary estimates.
- Remote eligibility.
- Application links.
- Recommended next actions.

Provide:

- Dashboard notifications.
- Email digest.
- Optional daily Markdown export.
- Optional JSON export.

Never send application emails automatically.

---

# PHASE 16 — DATA MODEL AND DATABASE DESIGN

Inspect the existing Prisma schema before making changes.

Reuse existing models.

Add only the entities genuinely needed.

Potential new entities:

- CareerEvidence.
- CareerAchievement.
- CareerTarget.
- JobSearchProfile.
- JobSourceConfiguration.
- JobDiscoveryRun.
- JobScreeningResult.
- JobRequirement.
- JobRequirementMatch.
- SalaryEstimate.
- SalarySource.
- ResumeCritique.
- ResumeFinding.
- ResumeVersion.
- GeneratedResumeEvidence.
- GapQuestion.
- GapAnswer.
- InterviewPlan.
- InterviewQuestion.
- InterviewSession.
- InterviewAnswer.
- STARStory.
- LearningPlan.
- LearningTopic.
- CompanyResearch.
- AIExecutionLog.
- AIModelConfiguration.
- PromptVersion.
- AutomationRun.

These are conceptual suggestions. Do not create duplicate entities if equivalent models already exist.

Requirements:

- Proper foreign keys.
- Appropriate indexes.
- Unique constraints.
- Cascading behavior where safe.
- Audit timestamps.
- Status fields.
- Soft deletion where appropriate.
- JSON fields only where justified.
- PostgreSQL compatibility.
- SQLite compatibility.
- Safe migrations.
- Data preservation.

Create a migration plan and validate it against both supported database configurations.

---

# PHASE 17 — API AND SERVICE ARCHITECTURE

Follow existing Dossier patterns.

Keep clear separation between:

- UI.
- API/controllers.
- Application services.
- Domain logic.
- AI orchestration.
- Provider adapters.
- Data repositories.
- Background execution.

Potential service boundaries:

- CareerProfileService.
- CareerEvidenceService.
- JobDiscoveryService.
- JobNormalizationService.
- JobFilteringService.
- JobAssessmentService.
- SalaryIntelligenceService.
- ResumeCritiqueService.
- ResumeGenerationService.
- GapQuestionService.
- InterviewPreparationService.
- LearningPlanService.
- CompanyResearchService.
- AIOrchestrationService.
- AIUsageService.

These are suggested responsibilities, not mandatory class names.

Use existing service abstractions where possible.

All AI calls should go through a shared orchestration layer.

---

# PHASE 18 — OBSERVABILITY AND ADMINISTRATION

Add execution observability.

Every job run should show:

- Start time.
- End time.
- Duration.
- Provider.
- Jobs fetched.
- Duplicates.
- Deterministic rejections.
- AI screenings.
- Full assessments.
- Failures.
- Token usage.
- Estimated cost.

Provide drill-down into individual job decisions.

For every decision, show why the job passed or failed.

Allow replaying failed stages without re-running the entire pipeline.

Avoid repeating paid AI operations unnecessarily.

Add structured logs and error tracking using existing project conventions.

---

# PHASE 19 — SECURITY AND PRIVACY

- Preserve Dossier authentication.
- Protect career profile data.
- Encrypt sensitive provider credentials using established application patterns.
- Keep secrets server-side.
- Avoid logging API keys.
- Protect external fetchers against SSRF.
- Validate URLs and redirect destinations.
- Apply request timeouts.
- Limit upload size and file types.
- Sanitize imported content.
- Protect against prompt injection.
- Add configurable data retention.
- Allow deletion and export of user data.
- Explain which AI providers receive personal career information.
- Respect local model privacy settings.
- Never expose another user's data.

Maintain Dossier's existing self-hosted privacy model.

---

# PHASE 20 — TESTING AND QUALITY ASSURANCE

Testing is mandatory.

## Unit tests

Test:

- Job normalization.
- Duplicate detection.
- Deterministic filtering.
- Salary normalization.
- Compatibility calculations.
- Evidence matching.
- Resume validation.
- AI response schemas.
- Prompt versioning.
- Token accounting.
- Gap question generation.
- Readiness calculation.

## Integration tests

Test:

- Existing job providers.
- Custom scraper integration.
- Apify integration.
- AI provider routing.
- Database persistence.
- Resume generation.
- PDF/DOCX output.
- Job assessment.
- Application creation.
- Interview preparation.

## End-to-end tests

Complete this scenario:

1. Create a career profile.
2. Add verified achievements.
3. Configure a job search.
4. Execute job discovery.
5. Import postings.
6. Apply deterministic filters.
7. Run AI screening.
8. Assess a shortlisted job.
9. Inspect requirement mapping.
10. Review salary estimate.
11. Answer gap questions.
12. Generate a tailored resume.
13. Validate the generated resume.
14. Create an interview plan.
15. Complete a mock interview.
16. Track the application.

Verify all screens, persistence and navigation.

Do not mark a feature complete because its UI exists.

It must actually work end to end.

---

# PHASE 21 — IMPLEMENTATION DELIVERY PLAN

Implement in these milestones.

### Milestone 1 — Audit and foundation

- Repository audit.
- Feature gap matrix.
- Architecture document.
- Data model design.
- Migration strategy.
- Shared AI response schemas.

### Milestone 2 — Career intelligence

- Evidence library.
- Achievement management.
- Career targets.
- Knowledge base.

### Milestone 3 — Job discovery

- Search profiles.
- Provider adapters.
- Scraper integration.
- Deterministic filters.
- Deduplication.
- Scheduling.

### Milestone 4 — AI job intelligence

- Lightweight screening.
- Full JD assessment.
- Requirement mapping.
- Salary intelligence.
- Job critique.

### Milestone 5 — Resume intelligence

- Resume critique.
- Impact-ranked recommendations.
- Evidence-backed bullet library.
- Gap questions.
- Tailored resume generation.
- ATS validation.

### Milestone 6 — Interview intelligence

- Question generation.
- STAR bank.
- Technical preparation.
- Mock interviews.
- Readiness tracking.

### Milestone 7 — Learning and company intelligence

- Personalized study plans.
- Company research.
- Preparation tracking.

### Milestone 8 — Automation and observability

- Daily digest.
- AI cost tracking.
- Pipeline monitoring.
- Notifications.
- Recovery mechanisms.

### Milestone 9 — QA and production readiness

- Full regression tests.
- Database migration tests.
- Performance checks.
- Security review.
- Documentation.
- Deployment validation.

After each milestone, run existing tests and newly added tests.

Do not leave placeholder pages, fake metrics, mocked production functionality or TODO-only implementations.

---

# PHASE 22 — FINAL ACCEPTANCE CRITERIA

The project is complete only when the following workflows work.

1. A user can maintain a complete professional career profile.
2. A user can store and verify professional achievements.
3. Multiple search profiles can operate independently.
4. Multiple job sources can be configured.
5. Jobs can be collected and deduplicated.
6. Deterministic filtering works before AI screening.
7. Different AI models can be configured for different tasks.
8. Shortlisted jobs receive complete JD assessments.
9. Every recommendation has explainable evidence.
10. Remote-work eligibility is checked.
11. Salary estimates have sources and confidence levels.
12. Missing experience is identified accurately.
13. Targeted gap questions can be answered.
14. Confirmed answers can improve the career profile.
15. Resume critiques rank improvements by impact.
16. Tailored resumes use verified achievements only.
17. Resume outputs are ATS-readable and validated.
18. Interview questions are generated from the actual JD.
19. Technical preparation includes practical exercises.
20. Mock interviews produce actionable feedback.
21. Learning plans are connected to identified gaps.
22. Company research is source-backed.
23. Applications retain their generated documents and history.
24. AI usage and costs are visible.
25. Scheduled executions are recoverable and observable.
26. Existing Dossier functionality continues to work.
27. PostgreSQL and SQLite remain supported.
28. Existing deployment and authentication continue working.
29. No critical workflow depends on fake or placeholder data.

---

# FINAL INSTRUCTION TO THE CODING AGENT

Think like a principal software architect, senior full-stack engineer, AI engineer, product designer and QA lead.

Do not simply implement the feature list literally.

First understand the existing application, then determine the correct implementation strategy.

Think about the complete user journey:

**Career Profile → Job Discovery → Intelligent Filtering → JD Analysis → Salary Research → Gap Questions → Resume Critique → Tailored Resume → Interview Preparation → Learning Plan → Application → Interview → Offer.**

Every module should share the same underlying career evidence and application context.

The AI should behave like a combination of:

- An experienced technical recruiter.
- A senior engineering hiring manager.
- A career strategist.
- A technical interviewer.
- A resume specialist.
- A compensation researcher.
- A learning mentor.

However, it must never pretend to know facts that it cannot verify.

Prioritize accuracy, explainability, cost efficiency, configurability, privacy and maintainability.

**Do not duplicate existing functionality. Do not break working functionality. Do not create disconnected modules. Do not hardcode AI behavior. Do not invent career facts.**

Implement the entire feature set incrementally, with working integrations, proper persistence, complete UI, tests and documentation.

At the end, provide:

1. Architecture audit.
2. Features already available and reused.
3. Features implemented.
4. New database migrations.
5. New API endpoints.
6. New UI pages and navigation.
7. AI models and prompts configured.
8. Tests executed and their results.
9. Outstanding limitations.
10. Deployment and configuration instructions.

The objective is a genuinely production-ready Career Intelligence Platform, not a collection of AI demos.