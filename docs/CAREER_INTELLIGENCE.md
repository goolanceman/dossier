# Career intelligence

Dossier keeps your career history as evidence you can check: achievements with their sources, the roles you are aiming at, and your own documents read into findings. From that it answers the questions a job search actually asks: how well a posting matches what you have really done, what a resume should say, and what to prepare before an interview. Nothing here is invented for you: every claim traces back to something you gave Dossier or confirmed yourself.

This page describes the screens, how the discovery pipeline works, and the rules Dossier's AI must keep.

## Career

Career (in the sidebar, next to Profile) holds the evidence behind everything else, in three sections.

- **Achievements** are what you have done, one record at a time: what happened, the problem, the action, the outcome, the technologies, and the source that backs it. Each has an evidence status, and a few can be kept side by side as retellings of the same fact: a technical version, a business version, a concise ATS version and so on.
- **Targets** are the roles you are aiming at, each with its own preferences and priorities. Plans and readiness are worked out per target, not for a generic "next job".
- **Knowledge base** takes your own documents, as text: an old resume, a LinkedIn export, project notes, a performance review. The AI reads each into findings (missing metrics, unclear claims, things worth turning into achievements) and drafts achievements from it. Drafts land as imported, never as verified, and wait for you.

## Discovery

Discovery is where searches become a pipeline instead of one query. A search profile names the titles, keywords, technologies, seniority, employment types, remote countries, companies to avoid or prefer, and industries to look for. It runs on a schedule you pick (hourly, every 6 hours, daily, weekdays, or any cron expression), through a built-in job source or one of your own external sources. Each run keeps its counts on record: what was fetched, what was filtered out and why, what the AI screened, and what was assessed.

## Job intelligence

Every posting Dossier keeps has an intelligence page, reachable from a saved posting in Find jobs ("Job intelligence") or from a candidate on the Agent screen. It gathers one posting's whole picture:

- **Compatibility:** a score from 0 to 100, a recommendation (strong match, potential match, weak match or reject) and how confident the AI was. Weights between the dimensions can be changed in Settings.
- **Requirement mapping:** each requirement from the posting, matched against your evidence, with the exact achievements that back it and a status for each: strong evidence, partial evidence, transferable experience, missing, or not applicable.
- **Salary:** the pay figure with the kind it is. See "What Dossier will not tell you" below.
- **Critique:** a written report on why the role fits, what is missing, and what to watch out for.
- **Gap questions:** where your evidence is unclear, questions to fill the gap. Answer them, skip them, mark them as unknown, or save them for later; an answer becomes a new achievement for you to confirm.
- **Company research:** what the notes say about the company, with every fact marked as confirmed (with its source) or interpretation (the AI's own reading).

## Resume intelligence

Upload a resume as PDF, Word, Markdown or text and Dossier reads it four ways: as an ATS would (parsing, keywords, formatting), as a writer would (generic statements, weak verbs, unquantified claims), as a recruiter would (the first seven seconds, seniority positioning), and for content. Each finding says what to change, why it matters, the effort it takes and its priority. The tailored documents Dossier writes map each bullet to the achievements it came from.

## Interview prep

The interview hub keeps, for the roles you are aiming at:

- **Readiness:** a score worked out from what actually happened: questions prepared, mock sessions finished with a passing score, gap questions still open. It is a calculation, not an AI opinion.
- **Plans:** predicted questions for a posting or target, each with why it may be asked, what a good answer covers, and which of your achievements to draw on.
- **Mock interviews:** question by question, with feedback on structure, depth and evidence.
- **STAR stories:** your reusable situation, task, action and result stories, linked to the achievements behind them.
- **Learning plans:** topics to close the gaps a target posting found, in order, with effort estimates you can mark off as you go.

## AI models & usage (Settings)

Every AI task can run on its own provider and model, with the app provider behind everything a task does not set: model, temperature, output limit, timeout, retries, a fallback model and concurrency. The same section shows the last 30 days of usage per task, and spending budgets per day or month that can stop AI work when exceeded.

## Automation (Settings)

Once a day, after discovery has run, the digest gathers what the pipeline found: the counts per stage, the best matches with their reasons, new salary figures, and the gap questions waiting for you. Each digest is kept for its day, optionally as Markdown, and can be emailed from a connected Gmail account to your own address. Nothing is ever sent to anyone else.

## The discovery pipeline

A run moves each posting through stages, and every stage can be left out of a profile:

1. **Fetch.** The source returns postings; duplicates, from this run or earlier ones, are set aside.
2. **Deterministic filters.** No AI: excluded keywords, blacklisted companies, wrong employment type or seniority, unsupported remote countries. A posting that fails here is recorded with its reason.
3. **Keyword matching.** The relevant sentences are found, so whole descriptions need not go to a model.
4. **Cheap screen.** A small, fast model decides whether the posting is worth a deeper look.
5. **Full assessment.** The strong model reads the whole posting against your evidence and writes the assessment the Job intelligence page shows.

Nothing is discarded without a recorded reason, at any stage.

## Evidence and how it is graded

Every achievement carries one of these statuses, and they are not equal:

- **Verified:** you checked it against a source.
- **User confirmed:** you typed or confirmed it yourself.
- **Imported:** brought in from a resume, a document or an import, not yet checked.
- **Needs clarification:** marked unclear, by you or the AI.
- **Rejected:** dismissed, and kept only so it is not suggested again.

The AI may only ever file its own work as imported or needing clarification. Verified and confirmed are statuses only you can grant. Generated resumes map each claim back to the achievements it used, and a fact missing from your profile shows up as a gap, not as filler.

## What Dossier will not tell you

- **Salary is labelled, always.** A figure is one of four kinds, and the label says which: stated in the job ad, publicly confirmed, estimated from market data, or unavailable. An estimate never presents itself as a confirmed offer.
- **Salary research needs sources.** Dossier does not make figures up. Without a source configured to research from, the honest answer is "Unavailable".
- **Company research reads notes, not the web.** Without a source to fetch notes from, every fact comes out marked as interpretation, never as confirmed.
- **Interview questions are predictions.** Generated questions are predicted or representative, not the company's actual questions.
- **The ATS score is an internal estimate.** Resume intelligence scores what an ATS would stumble on; it is a diagnostic, not a result any employer produced.

## How the screens connect

The pieces are meant to be walked through in order, and every screen hands to the next:

1. A **search profile** in Discovery finds postings on its schedule and assesses them.
2. A posting worth a closer look opens in **Job intelligence**, from Find jobs ("Job intelligence" on a saved posting) or from the Agent screen.
3. There you read the requirement mapping, the salary and the critique, answer the **gap questions**, and read the **company research**.
4. Missing skills go to a **learning plan**; preparation goes to **Interview prep**, where the predicted questions land.
5. **Resume intelligence** reads your resume the way a recruiter would, and the application's tailored documents map each bullet back to the achievements that back it.
6. The **digest** gathers what all of this found each day.

Applications keep what they were built from: the posting, the assessment, the documents, and the evidence map behind them.

## Where your data goes

Your profile, achievements and documents stay in your own database. What leaves your server is what you send to the AI provider you chose. A local model through Ollama or LM Studio keeps career data on your own hardware; a hosted provider receives what it writes from, as described on the Privacy page. Usage and budgets in Settings show what each task called, from what the provider reported.

## Configuring sources and models

External job sources (your own remote scraper over HTTP, or Apify actors) are configured on the Discovery screen, and each search profile chooses the source it uses. Per-task model routing, usage and budgets live in Settings → AI models & usage. The built-in job source and its key stay in Settings → Job search, as before.
