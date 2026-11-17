import { describe, expect, it } from "vitest";

import { digestMarkdown, digestSchema } from "./build";

// Markdown rendering is pure: the same digest always renders the same way,
// and a quiet day is said to be quiet rather than left blank.

const digest = digestSchema.parse({
  counts: { discovered: 23, rejectedDeterministic: 9, screened: 6, shortlisted: 4, assessed: 2 },
  bestMatches: [
    { postingId: "p1", title: "Senior Backend Engineer", company: "Ledgerly", score: 87, reasons: ["Strong TypeScript match", "Berlin, hybrid"], url: "https://jobs.example/1" },
    { postingId: "p2", title: "", company: "", score: 71, reasons: [], url: "" },
  ],
  salaryInsights: [
    { company: "Ledgerly", title: "Senior Backend Engineer", label: "EUR 68,000 median a year" },
    { company: "", title: "", label: "from EUR 50,000 a year" },
  ],
  gapQuestionsOpen: 3,
  nextActions: ["Review 4 shortlisted jobs", "Answer 3 open gap questions"],
});

describe("digestMarkdown", () => {
  it("renders the day's counts, one line per nonzero stage", () => {
    const markdown = digestMarkdown(digest);
    expect(markdown).toContain("# Daily job digest");
    expect(markdown).toContain("- 23 new postings found");
    expect(markdown).toContain("- 9 rejected by the fixed filters");
    expect(markdown).toContain("- 6 screened");
    expect(markdown).toContain("- 4 shortlisted");
    expect(markdown).toContain("- 2 fully assessed");
  });

  it("lists the best matches with score, reasons and the posting's address", () => {
    const markdown = digestMarkdown(digest);
    expect(markdown).toContain("1. Senior Backend Engineer at Ledgerly: score 87 of 100");
    expect(markdown).toContain("   - Strong TypeScript match");
    expect(markdown).toContain("   - https://jobs.example/1");
    // A posting without title, company, reasons or address still names itself honestly.
    expect(markdown).toContain("2. Untitled posting at an unknown company: score 71 of 100");
  });

  it("lists the salary figures and the open questions", () => {
    const markdown = digestMarkdown(digest);
    expect(markdown).toContain("- Ledgerly, Senior Backend Engineer: EUR 68,000 median a year");
    expect(markdown).toContain("- Unknown company, unknown role: from EUR 50,000 a year");
    expect(markdown).toContain("3 open gap questions are waiting for an answer.");
  });

  it("lists the next steps", () => {
    const markdown = digestMarkdown(digest);
    expect(markdown).toContain("## Next steps");
    expect(markdown).toContain("- Review 4 shortlisted jobs");
    expect(markdown).toContain("- Answer 3 open gap questions");
  });

  it("says so when nothing ran, instead of leaving the sections blank", () => {
    const quiet = digestSchema.parse({
      counts: { discovered: 0, rejectedDeterministic: 0, screened: 0, shortlisted: 0, assessed: 0 },
      bestMatches: [],
      salaryInsights: [],
      gapQuestionsOpen: 0,
      nextActions: [],
    });
    const markdown = digestMarkdown(quiet);
    expect(markdown).toContain("Nothing ran in the last 24 hours.");
    expect(markdown).toContain("No strong matches yet.");
    expect(markdown).toContain("No new salary figures.");
    expect(markdown).toContain("No gap questions are waiting.");
    expect(markdown).toContain("Nothing is waiting: discovery is idle, and no questions are open.");
    expect(markdown).not.toContain("0 new");
  });

  it("ends with a newline and never draws an em dash", () => {
    const markdown = digestMarkdown(digest);
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown).not.toContain("\u2014");
  });
});
