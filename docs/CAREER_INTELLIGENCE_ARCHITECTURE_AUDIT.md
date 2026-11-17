# Career Intelligence Architecture Audit

Per `docs/master.md` Phase 0.2. Written against the actual source (not the README), before implementation.

## 1. Existing architecture

| Layer | Location | Notes |
|---|---|---|
| App | Next.js 16 App Router, React 19, Tailwind 4 | `src/app`, grouped under `(app)` with a shared sidebar |
| Data | Prisma 7 + PostgreSQL 18 (adapter-pg) | `prisma/schema.prisma`, single-user self-hosted model (no userId columns) |
| Mutations | Server Actions via `action()` (`src/lib/action.ts`), route handlers via `route()` | Zod-validated inputs, session-checked |
| AI | `src/lib/ai` | Providers: LOCAL (Ollama), OPENAI-compatible, ANTHROPIC, MISTRAL, LMSTUDIO + MOCK for tests. One configured provider at a time (`Setting` keys / env). Tasks in `src/lib/ai/tasks/*` take a provider + input + `TaskOptions`, return `{ data, promptVersion }`, validate JSON with Zod (`structured-output`) with retry/repair |
| Hallucination guard | `src/lib/ai/fact-guard.ts` | Checks names/numbers/credentials against profile+posting sources; flags "check this" |
| Background jobs | `src/lib/jobs/runner.ts` | `defineJob`/`startJob` with queue, steps, cancel/retry, SSE events, DB-persisted `Job` rows |
| Job search | `src/lib/job-search` | Adapter per source: JSEARCH, ADZUNA, ARBEITSAGENTUR, FREEHIRE. `foundPostingSchema` normalizes; `searchQuerySchema` is the query shape; cache + rate-limit handling |
| Agent | `src/lib/agent` | Daily `agent-scan` job: one search, dedupe (`agentDedupeKey`), score newest, store `AgentCandidate`, drafts → applications |
| Scoring | `src/lib/scoring` | `score-posting` AI task or Jev; returns `PostingFit {score, reasons, redFlags}` |
| Applications | `Application` + `Document`(units) + `DocumentVersion` + `ChatMessage`(refine) + `Note` + `Fact` + `StatusEvent` + `EmailMessage` | Full lifecycle, human-approval workflow (agent drafts await review) |
| Profile | `ProfileField` (kv) + `Experience`/`Project`/`Education`/`Publication`/`Reference`/`Skill`/`Language`/`Fact` | Resume import → `importedProfileSchema` → user review → apply |
| Documents | Themes, DOCX/PDF via print routes, `unpdf`/`mammoth` for reading | Base resume + per-application tailored docs |
| Auth | Password (hash in env), `LoginThrottle`, session | Single install |
| Google | Gmail + Calendar OAuth (`src/lib/google`) | Emails linked to applications, interview events |
| MCP/OAuth | `src/app/api/mcp`, `src/app/api/oauth` | Claude connector handoff |
| Tests | Vitest (unit + `*.db.test.ts` against a `_test` database) + Playwright e2e with fake-AI/fake-jobs servers | `yarn test`, `yarn test:e2e` |

## 2. Existing features and locations (condensed)

- Find jobs screen `src/app/(app)/jobs` — search, save/dismiss, score, start application.
- Agent screen `src/app/(app)/agent` — daily scan results, approve/dismiss, drafts.
- Resume workspace `src/app/(app)/resume`, themes, print/PDF `src/app/print`.
- Profile screens incl. import `src/app/(app)/profile/*`.
- Applications board + detail, inbox (Gmail), startups (YC/HN), settings (AI provider, scoring, job source keys, agent schedule).
- Dashboard with funnel/calendar/activity.
- Data export/import, backups, usage ping, update check.

## 3. Existing reusable components

`src/components/ui/*` (button, card, confirm-dialog, toast…), page header, period filter, chart components, `useJob` hook (SSE job progress), `PageHeader`, section patterns in profile/settings screens. Reuse these; do not build parallel UI primitives.

## 4. Existing database entities and relationships

See `prisma/schema.prisma`: Profile fields (kv), Skill/Language/Experience/Project/Education/Publication/Reference/Fact, Theme, Setting(kv), Application(+status machinery), Document/Version, ChatMessage, Note, Posting/PostingScore/PostingSearch, AgentCandidate, Startup(+Block), GoogleAccount/EmailMessage, LoginThrottle, Job.

## 5. Existing AI abstraction and prompt architecture

- Task pattern: `Task<Input, Output>` = async (provider, input, options) => `{ data, promptVersion }`; system prompt assembled from versioned prompt parts (`system()`, `UNTRUSTED_POSTING`, `truthfulness(strict)`, language rule, creativity).
- JSON mode with Zod schema; provider-level structured output where supported; validation with model-readable repair loop.
- Prompt versions recorded with results (e.g. `tailor-resume@1`).
- Single global provider config (`Settings → AI provider` or env). **No per-task model routing yet.** No token/cost logging yet.

## 6. Existing job scraping and discovery mechanisms

Adapter interface in `src/lib/job-search/adapter.ts`; per-source implementations + tests; searches cached as `PostingSearch`; postings dedupe by source+externalId and `agentDedupeKey` (link hash without trackers). Agent runs one saved search/day. **No multi-stage filtering pipeline, no named search profiles, no external-scraper/Apify adapters yet.**

## 7. Existing limitations (gaps that genuinely need building)

1. No career achievement/evidence library with verification statuses (closest: flat `Fact`).
2. No multiple career targets with per-target preferences.
3. No named, criteria-rich search profiles; agent uses one query.
4. No staged pipeline (deterministic → keyword → cheap screen → deep assess → recommend).
5. No salary research service; salary is a free-text string from sources.
6. No dedicated Job Intelligence page (requirement mapping exists only inside applications via `match-requirements`).
7. No resume critique (ATS/writing/recruiter) module.
8. No gap-questions workflow.
9. No interview question generation / STAR bank / mock interviews / readiness.
10. No learning plans.
11. No company research module.
12. No per-task AI model routing/fallback, no token/cost usage logging, no budgets.
13. No daily digest; agent notifications are per-candidate only.
14. No pipeline observability beyond `Job` rows and agent run records.

## 8. Proposed module architecture (new code lives beside, not over, existing)

```
src/lib/career/       Career evidence: achievements, targets, knowledge base (uses Prisma + existing patterns)
src/lib/discovery/    Search profiles + staged pipeline + runs (reuses job-search adapters, jobs runner, agent schedule)
src/lib/ai/tasks/     New versioned AI tasks (screen-posting, assess-job, salary-research, resume-critique, gap-questions, interview-prep, company-research, learning-plan) — same Task<,> contract
src/lib/ai/routing    Per-task model routing + fallback + usage logging (wraps createProvider; settings-driven)
src/lib/salary/       Salary estimate persistence + normalization
src/lib/job-intel/    JD extraction extension, requirement matching with evidence, critique, score weights
src/lib/resume-intel/ Critique persistence, evidence-backed bullets, tailoring validation (reuses tailorResume + fact-guard)
src/lib/interview/    Plans, questions, STAR, mock sessions, readiness
src/lib/learning/     Plans/topics + status
src/lib/companies/    Company research persistence
src/lib/digest/       Daily digest build + delivery (email optional, markdown/json export)
```

UI extends existing screens and adds sections under the existing `(app)` layout and nav; AI Settings extends Settings.

## 9. Existing functionality that can be extended (NOT duplicated)

- `match-requirements` task → reuse inside job assessment (requirement→evidence mapping).
- `fact-guard` → reuse for resume/cover-letter validation.
- `tailorResume` → reuse for tailored generation; add evidence mapping + validation wrapper.
- Job runner (`defineJob`) → all new long tasks are jobs, gaining steps/cancel/retry/SSE for free.
- Agent schedule (`src/lib/agent/schedule.ts`) → extend for cron-like profiles instead of a new scheduler.
- `PostingScore`/`scoring` → feed stage outputs; do not fork.
- Existing screens' list/detail/section patterns and UI primitives.
- Existing zod schemas: `foundPostingSchema`, `searchQuerySchema`, `extractedSchema`, `matchSchema`.

## 10. New functionality that genuinely requires implementation

Per-item mapping to milestones: evidence library (M2), search profiles + pipeline + adapters for external scrapers (M3), staged AI screening/assessment + salary + critique + gap questions (M4–5), interview + learning + company modules (M6–7), AI routing/usage/budgets + digest + observability (M8), QA (M9).

## 11. Database changes (summary)

New models (no changes to existing ones unless stated): `CareerAchievement`, `CareerTarget`, `KnowledgeDoc`, `JobSearchProfile`, `DiscoveryRun`, `JobAssessment`, `SalaryEstimate`, `ResumeCritique`, `GapQuestion`, `InterviewPlan`, `InterviewQuestion`, `MockSession`, `StarStory`, `LearningPlan`, `LearningTopic`, `CompanyResearch`, `AiTaskConfig`, `AiUsageLog`, `DigestRun`. Enum additions are new enums only. Additive columns: none on existing tables required by design (keeps existing migrations/code untouched). Full list with relations/indexes in `prisma/schema.prisma` and its migration.

## 12. API changes

Server Actions in the new modules' `actions.ts` files following `action(schema, handler)`; route handlers only for files/uploads/streams per DEVELOPMENT.md. New pages under `(app)`; nav extended.

## 13. Frontend changes

New sections/screens: Career (evidence library, targets), Discovery (profiles, runs), Job Intelligence page, Resume Intelligence page, Interview hub, Learning, AI Settings (routing/usage/budgets), Automation/digest; dashboard additions. All reuse `src/components/ui`.

## 14. Migration and backward compatibility strategy

- All schema changes are additive; no existing column is dropped or retyped, so existing data and `migrate deploy` are safe.
- Existing features keep their current entry points; new capabilities surface as new nav sections and additions to Settings.
- Both hosted and local providers keep working: routing falls back to the single configured provider when no per-task config exists.
- Feature flags not needed: features are inert until configured (empty states).
- Tests: existing suite must keep passing; every new module ships with unit + db tests; e2e extended for the core journey.

## Implementation status

Written after implementation, against the source. Everything below exists in the tree; nothing is a placeholder.

### Shipped modules

| Module | Location | What it does |
|---|---|---|
| Career evidence | `src/lib/career` (`achievements.ts`, `targets.ts`, `knowledge.ts`) | Achievement library with evidence statuses and retelling versions, career targets, knowledge base that reads the user's documents into findings and drafted achievements |
| Discovery | `src/lib/discovery` (`profile.ts`, `filters.ts`, `keyword.ts`, `pipeline.ts`, `external.ts`, `runner.ts`) | Search profiles with criteria, deterministic filters, keyword extraction, the staged pipeline, external sources (user's own HTTP scraper + Apify actors), scheduled runs |
| Job intelligence | `src/lib/job-intel` (`assess.ts`, `critique.ts`, `weights.ts`, `mandatory.ts`) | Full JD assessment, job critique, configurable score weights, mandatory rejection rules |
| Salary | `src/lib/salary` (`estimate.ts`, `normalize.ts`) | The four figure kinds (STATED/CONFIRMED/ESTIMATED/UNAVAILABLE), posting-text parsing, persistence |
| Gap questions | `src/lib/gaps` (`lifecycle.ts`) | Generate, answer, skip, mark unknown, save for later |
| Interview | `src/lib/interview` (`plans.ts`, `mock.ts`, `readiness.ts`) | Plans and predicted questions, mock sessions with feedback, deterministic readiness |
| Learning | `src/lib/learning` (`plan.ts`) | Learning plans and topics per posting |
| Resume intelligence | `src/lib/resume-intel` (`critique.ts`, `evidence.ts`) | Critique persistence, claim-to-evidence mapping for tailored documents |
| Digest | `src/lib/digest` (`build.ts`, `deliver.ts`, `runner.ts`) | Daily digest build, Markdown export, delivery |
| AI routing | `src/lib/ai/routing.ts`, `budget.ts`, `usage.ts` | Per-task provider/model/limits, usage logging, daily and monthly budgets |
| New AI tasks | `src/lib/ai/tasks/` | `screen-posting`, `assess-job`, `salary-research`, `resume-critique`, `gap-questions`, `interview-prep`, `mock-feedback`, `company-research`, `learning-plan`, `doc-findings` |

### New Prisma models

`CareerAchievement`, `CareerTarget`, `KnowledgeDoc`, `JobSearchProfile`, `DiscoveryRun`, `JobAssessment`, `SalaryEstimate`, `ResumeCritique`, `DocumentEvidence`, `GapQuestion`, `InterviewPlan`, `InterviewQuestion`, `MockSession`, `StarStory`, `LearningPlan`, `LearningTopic`, `CompanyResearch`, `AiTaskConfig`, `AiUsageLog`, `DigestRun`. All additive; no existing column was dropped or retyped.

### New routes and screens

- `/career` (Achievements, Targets, Knowledge base), `/discovery` (profiles, runs, external sources), `/intelligence/[id]` (one posting's assessment, salary, critique, gap questions, company research), `/resume-intel`, `/interview` (readiness, plans, mock, stories, learning).
- Settings gained the "AI models & usage" and "Automation" sections; the dashboard gained a career-intelligence panel.
- Drill-downs: a saved or otherwise kept posting in Find jobs and an Agent candidate with a Posting row link to `/intelligence/<postingId>`.

### Known limitations

- Company research reads notes the caller fetched; no notes source is wired up yet, so without one every fact comes out as INTERPRETATION (interpretation-only), never CONFIRMED.
- Salary research needs sources to research from; without a configured source the result is UNAVAILABLE and no figure is given.
- The digest is emailed only through a connected Gmail account, to the user's own address; otherwise it is kept as data and optional Markdown.
- External job sources cover the user's own HTTP scraper and Apify actors; other sources would need further adapters.
- An Agent candidate links to Job intelligence only when a Posting row exists (kept on draft preparation, approve or dismiss, or by Find jobs); a posting the agent only scored has none.
- No embeddings/vector search: knowledge base matching is deterministic text handling.
