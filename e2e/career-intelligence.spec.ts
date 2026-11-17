import { expect, test, type Page } from "@playwright/test";

import { fakeJobSearches, resetData, sql } from "./support";

// Career intelligence end to end (master.md Phase 20): the evidence library
// and targets, a knowledge doc reviewed into findings and drafts, a discovery
// run that screens and assesses what the fake sources answer, the posting's
// intelligence with gap questions, a resume critique, interview prep with a
// mock session and a learning plan, and the readiness numbers that move with
// all of it. The AI answers come from the fake server, keyed by task.
test.beforeAll(resetData);

/** The document the knowledge review reads; the fake review quotes it for real. */
const DOC_TEXT = [
  "Ledgerly Payments · Payouts, 2024–2026",
  "I led the redesign of the merchant payout flow, working with research and compliance.",
  "We used Kafka, Postgres and React.",
  "Our team delivered the new payout dashboard.",
  "The launch went smoothly and merchants were happy.",
].join("\n");

/** The pasted resume the critique reads. */
const RESUME_TEXT = [
  "Jane Doe — Senior Product Designer",
  "I led the redesign of the merchant payout flow and worked with research.",
  "Skills: Figma, Prototyping, Design systems",
].join("\n");

/** The achievement the spec seeds, verified, so the assessment can point at it. */
const ACHIEVEMENT_TITLE = "Led the merchant payout flow redesign";
const PROFILE_NAME = "Design roles, Netherlands";

/** An achievement's row button, told apart from its Move buttons by its status pill. */
const achievementRow = (page: Page, title: string) =>
  page.getByRole("button", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).filter({ hasText: "Imported (unverified)" });

/** A question card in a plan, told apart from the others by its question text. */
const questionCard = (page: Page, question: string) =>
  page.locator("div.rounded-panel").filter({ has: page.getByText(question, { exact: true }) }).last();

test("the career journey: achievements, a reviewed document, a discovery run, and the intelligence behind one posting", async ({ page }) => {
  // ── a. The evidence library and a target ─────────────────────────────────
  await page.goto("/career?section=achievements");
  await page.getByRole("button", { name: "Add achievement" }).click();
  await page.getByLabel("Title").fill(ACHIEVEMENT_TITLE);
  await page.getByLabel("What you did").fill("Led the redesign of the merchant payout flow end to end, with research and compliance.");
  await page.getByLabel("Metrics").fill("Merchant payout questions down by a third (support dashboards)");
  await page.getByRole("button", { name: "Save achievement" }).click();
  await expect(achievementRow(page, ACHIEVEMENT_TITLE)).toBeVisible();

  // The user checks the source: the pill moves from Imported (unverified) to Verified.
  await achievementRow(page, ACHIEVEMENT_TITLE).click();
  await page.getByRole("button", { name: "Mark verified" }).click();
  await expect(page.getByRole("button", { name: new RegExp(ACHIEVEMENT_TITLE) }).filter({ hasText: /Verified/ })).toBeVisible();

  await page.goto("/career?section=targets");
  await page.getByRole("button", { name: "Add target" }).click();
  await page.getByLabel("Title").fill("Staff Product Designer");
  await page.getByLabel("What you want from it").fill("Payments and complex flows, close to research.");
  await page.getByRole("button", { name: "Save target" }).click();
  await expect(page.getByText("Staff Product Designer")).toBeVisible();
  await expect(page.getByText(/Primary/)).toBeVisible();

  // ── b. The knowledge base: a document reviewed into findings and a draft ──
  await page.goto("/career?section=knowledge");
  await page.getByRole("button", { name: "Add a document" }).click();
  await page.getByLabel("Name").fill("Payouts project notes");
  await page.getByLabel("Text").fill(DOC_TEXT);
  await page.getByRole("button", { name: "Save document" }).click();
  await expect(page.getByRole("button", { name: /Payouts project notes/ })).toBeVisible();

  await page.getByRole("button", { name: /Payouts project notes/ }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText("Reviewed", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("2 findings · 1 draft achievement")).toBeVisible();
  await expect(page.getByText("Missing metric")).toBeVisible();
  await expect(page.getByText("Kafka is named without anything it was used for.")).toBeVisible();
  await expect(
    page.getByText("1 draft achievement in your library, marked Imported (unverified) until you check it."),
  ).toBeVisible();

  // ── c. Discovery: a search profile, run now against the fake sources ─────
  await page.goto("/discovery");
  await page.getByRole("button", { name: "New profile" }).click();
  await page.getByLabel("Name").fill(PROFILE_NAME);
  await page.getByLabel("What").fill("Product designer");
  await page.getByLabel("Where").fill("Rotterdam");
  await page.getByLabel("Country").selectOption({ label: "Netherlands" });
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByText("Product designer · Rotterdam, 25 km · via JSearch")).toBeVisible();

  const profiles = page.getByRole("region", { name: "Search profiles" });
  const profileCard = profiles.getByRole("listitem").filter({ hasText: PROFILE_NAME });
  const searches = await fakeJobSearches();
  await profileCard.getByRole("button", { name: "Run now" }).click();

  // The run appears in the history once it's done, with what each stage did.
  const runs = page.getByRole("region", { name: "Runs history" });
  const run = runs.getByRole("listitem").filter({ hasText: PROFILE_NAME });
  await expect(run.getByText("Done", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(run.getByText("4 postings found · 0 seen before · 0 filtered out · 4 screened · 4 shortlisted · 4 assessed")).toBeVisible();
  // The source was asked for both pages of the search.
  expect(await fakeJobSearches()).toBe(searches + 2);

  // ── d. The run's posting, opened in Job Intelligence ──────────────────────
  await run.getByRole("button", { name: "4 postings · Show" }).click();
  const ledgerly = run.getByRole("listitem").filter({ hasText: "Senior Product Designer, Payments" });
  await expect(ledgerly).toContainText("Assessed · Potential match, 75 of 100");

  const [posting] = await sql<{ id: string }>(`SELECT id FROM "Posting" WHERE "externalId" = 'e2e-ledgerly'`);
  await page.goto(`/intelligence/${posting.id}`);
  await expect(page.getByRole("heading", { name: "Compatibility" })).toBeVisible();
  await expect(page.getByText("Potential match · 75 of 100")).toBeVisible();
  await expect(page.getByRole("img", { name: "Score 75 of 100" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Technical skills: 80 of 100" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Why the assessment landed here" })).toContainText("APPLY_AFTER_PREPARATION");

  // The requirement mapping, with the library's achievement as evidence.
  await expect(page.getByRole("heading", { name: "Requirement mapping" })).toBeVisible();
  const mapping = page.getByRole("table");
  await expect(mapping.getByText("5+ years of product design").first()).toBeVisible();
  await expect(mapping.getByText("Strong evidence")).toBeVisible();
  await expect(mapping.getByRole("link", { name: ACHIEVEMENT_TITLE })).toBeVisible();
  await expect(mapping.getByText("Missing evidence")).toBeVisible();
  await expect(mapping.getByText("None in your library")).toBeVisible();

  // The salary section: the advert's own figure, labelled as stated.
  await expect(page.getByText("Stated in the job ad")).toBeVisible();
  await expect(page.getByText("EUR 75,000 – EUR 90,000")).toBeVisible();

  // Company research without sources: everything stays interpretation.
  await page.getByRole("button", { name: "Research company" }).click();
  await expect(page.getByText("No sources were available to research from, so everything here is interpretation, marked as such.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Interpretation — check this yourself").first()).toBeVisible();

  // ── Gap questions: generate, answer one, see it leave the open list ───────
  await page.getByRole("button", { name: "Generate gap questions" }).click();
  const open = page.getByRole("list", { name: "Open gap questions" });
  await expect(open.getByRole("listitem")).toHaveCount(2);
  const firstQuestion = open.getByRole("listitem").filter({ hasText: "What did the payout redesign change for merchants" });
  await firstQuestion.getByLabel(/Your answer to:/).fill("Merchant payout questions dropped by a third within a month of the redesign.");
  await firstQuestion.getByRole("button", { name: "Answer" }).click();
  await expect(page.getByText("Done. The question has moved on.")).toBeVisible();
  const [answered] = await sql<{ status: string; answer: string }>(
    `SELECT status, answer FROM "GapQuestion" WHERE question LIKE 'What did the payout redesign change%'`,
  );
  expect(answered?.status).toBe("ANSWERED");
  expect(answered?.answer).toContain("dropped by a third");
  // The open list sheds the answered question on the next look.
  await page.reload();
  await expect(page.getByRole("list", { name: "Open gap questions" }).getByRole("listitem")).toHaveCount(1);
});

test("resume intelligence: a pasted resume critiqued, the score labelled an internal estimate", async ({ page }) => {
  await page.goto("/resume-intel");
  await page.getByLabel(/paste the resume/).fill(RESUME_TEXT);
  await page.getByRole("button", { name: "Run critique" }).click();

  await expect(page.getByRole("heading", { name: "Critique of your base resume" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Internal diagnostic estimate: 64 of 100" })).toBeVisible();
  await expect(page.getByText("ATS readiness: fair")).toBeVisible();
  await expect(page.getByText("This score is an internal diagnostic estimate, not an employer screening result.")).toBeVisible();

  const improvements = page.getByRole("list", { name: "Improvements by priority" });
  await expect(improvements.getByRole("listitem")).toHaveCount(3);
  await expect(improvements.getByText("The payout redesign carries no metric")).toBeVisible();
  await expect(improvements.getByText("critical", { exact: true })).toBeVisible();
  await expect(improvements.getByText("high", { exact: true })).toBeVisible();
  await expect(improvements.getByText("medium", { exact: true })).toBeVisible();
  await expect(page.getByText("What an ATS would stumble on")).toBeVisible();
  await expect(page.getByText("The skills list mixes tools and levels in one line.")).toBeVisible();

  // The critique is kept, with its estimate beside it.
  await expect(page.getByText("internal estimate 64/100")).toBeVisible();
});

test("interview prep: a plan, a prepared question, a mock verdict, and a learning plan", async ({ page }) => {
  // ── Generate a plan for a role, and mark one question prepared ────────────
  await page.goto("/interview");
  const plans = page.getByRole("region", { name: "Interview plans" });
  await plans.getByRole("button", { name: "Generate plan" }).click();
  await page.getByLabel("Role").fill("Senior Product Designer, Payments");
  await plans.getByRole("button", { name: "Generate plan" }).click();

  await expect(page.getByRole("heading", { name: "Senior Product Designer, Payments" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("These are predicted, representative questions, not the company's actual interview questions.").first()).toBeVisible();
  await expect(page.getByText(/0 of 3 prepared/)).toBeVisible();

  const technical = questionCard(page, "How do you decide what to prototype first when a flow is complex?");
  await expect(technical.getByText("Evidence to draw on: Led the merchant payout flow redesign")).toBeVisible();
  await technical.getByRole("button", { name: "Prepared" }).click();
  await expect(technical.getByRole("button", { name: "Prepared" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/1 of 3 questions prepared/)).toBeVisible();

  // The readiness number the data gives so far: one of three prepared, one
  // open gap question still subtracting.
  const readiness = () => page.getByLabel(/^Overall readiness:/).getAttribute("aria-label");
  const before = await readiness();
  expect(before).toContain("of 100");

  // ── A text mock interview: one answer, the verdict, the session scored ────
  await page.goto("/interview");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByText("Walk me through your background and why this role fits it.")).toBeVisible();
  await page
    .getByLabel("Your answer")
    .fill(
      "The merchant payout flow was late and unexplained. I led its redesign with research and compliance, and merchant payout questions dropped by a third within a month.",
    );
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByText(/The interviewer.s verdict/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Technical accuracy: 72 of 100" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Evidence use: 80 of 100" })).toBeVisible();
  await expect(page.getByText("Graded: 73 of 100")).toBeVisible();

  // The readiness number moved: the completed session adds its bonus.
  await page.goto("/interview");
  await expect(page.getByText(/1 completed mock sessions/)).toBeVisible();
  const after = await readiness();
  expect(after).not.toBe(before);

  // ── A learning plan, with one topic moved along ───────────────────────────
  const learning = page.getByRole("region", { name: "Learning plans" });
  await learning.getByRole("button", { name: "New plan" }).click();
  await page.getByLabel("Goal").fill("Be ready for senior payments design roles");
  await learning.getByRole("button", { name: "Generate plan" }).click();
  await expect(page.getByRole("heading", { name: "Be ready for senior payments design roles" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/0 of 2 topics completed/)).toBeVisible();
  await page.getByLabel("Status of Payments fundamentals for designers").selectOption({ label: "Completed" });
  await expect(page.getByText(/1 of 2 topics completed/)).toBeVisible();
});

// Settings → AI models & usage: every task row resolves to the environment's
// model, and the daily budget saves through the tracker.
test("ai-routing rows and the daily budget", async ({ page }) => {
  await page.goto("/settings?section=ai-routing");
  await expect(page.getByRole("heading", { name: "AI models & usage" })).toBeVisible();
  // Every task row resolves to the environment's model, and none is switched off.
  await expect(page.getByText("Runs on OpenAI-compatible with fake-model.")).toHaveCount(10);
  await page.getByLabel("Daily budget (cents)").fill("500");
  await page.getByRole("button", { name: "Save budgets" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await expect
    .poll(async () => (await sql<{ value: string }>(`SELECT value FROM "Setting" WHERE key = 'aiBudgetDailyCents'`))[0]?.value)
    .toBe("500");
});

// Settings → Automation: the digest turns on, and the preview renders its markdown.
test("the automation section: digest on, and a preview of its markdown", async ({ page }) => {
  await page.goto("/settings?section=automation");
  await expect(page.getByRole("heading", { name: "Automation" })).toBeVisible();
  await page.getByRole("switch", { name: "Build the daily digest" }).click();
  await expect(page.getByRole("switch", { name: "Build the daily digest" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Preview today's digest" }).click();
  await expect(page.locator("pre")).toContainText("# Daily job digest", { timeout: 30_000 });
});

test("the dashboard shows the career intelligence picture", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Career intelligence" });
  await expect(section.getByText("What discovery, preparation and AI use look like this week.")).toBeVisible();
  // The best matches: the postings the discovery run assessed, each opening its intelligence page.
  await expect(section.getByText("Best matches")).toBeVisible();
  const bestMatch = section.getByRole("link", { name: /Senior Product Designer, Payments/ });
  await expect(bestMatch).toHaveCount(1);
  await expect(bestMatch).toContainText("75 · Potential match");
  await expect(bestMatch).toHaveAttribute("href", /\/intelligence\//);
  // Next actions from the data the journey left behind.
  await expect(section.getByText("Recommended next actions")).toBeVisible();
  await expect(section.getByText(/gap questions? waits? for answers\./)).toBeVisible();
});
