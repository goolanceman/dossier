import { describe, expect, it } from "vitest";

import { computeReadiness } from "./readiness";

const prepared = (category: string, isPrepared = true) => ({ category, difficulty: "INTERMEDIATE", prepared: isPrepared });
const session = (status = "COMPLETED", score: number | null = 80, kind = "TECHNICAL") => ({ kind, status, score });

describe("computeReadiness", () => {
  it.each([
    [
      "everything prepared with passing mocks is fully ready",
      {
        questions: [prepared("TECHNICAL"), prepared("SYSTEM_DESIGN"), prepared("BEHAVIORAL"), prepared("HR")],
        sessions: [session("COMPLETED", 90), session("COMPLETED", 70)],
        storyCount: 3,
        unansweredGaps: 0,
      },
      { overall: 100, technical: 100, behavioral: 100, systemDesign: 100, preparedQuestions: 4, totalQuestions: 4, completedSessions: 2 },
    ],
    [
      "nothing prepared and no sessions leaves the score at zero",
      {
        questions: [prepared("TECHNICAL", false), prepared("BEHAVIORAL", false)],
        sessions: [],
        storyCount: 0,
        unansweredGaps: 0,
      },
      { overall: 0, technical: 0, behavioral: 0, systemDesign: 0, preparedQuestions: 0, totalQuestions: 2, completedSessions: 0 },
    ],
    [
      "categories land in the right dimension, and a dimension with no questions stands at zero",
      {
        // Technical: 1 of 3 prepared (SYSTEM_DESIGN counts as technical), so 33.
        // Behavioral: 1 of 4, so 25. System design: 0 of 1. Base: the mean of the three.
        questions: [
          prepared("TECHNICAL"),
          prepared("TECHNICAL", false),
          prepared("BEHAVIORAL"),
          prepared("BEHAVIORAL", false),
          prepared("HR", false),
          prepared("HIRING_MANAGER", false),
          prepared("SYSTEM_DESIGN", false),
        ],
        sessions: [],
        storyCount: 0,
        unansweredGaps: 0,
      },
      { overall: 19, technical: 33, behavioral: 25, systemDesign: 0, preparedQuestions: 2, totalQuestions: 7, completedSessions: 0 },
    ],
    [
      "a dimension with no questions yet does not drag the base down",
      {
        questions: [prepared("TECHNICAL"), prepared("TECHNICAL", false)],
        sessions: [],
        storyCount: 0,
        unansweredGaps: 0,
      },
      { overall: 50, technical: 50, behavioral: 0, systemDesign: 0, preparedQuestions: 1, totalQuestions: 2, completedSessions: 0 },
    ],
    [
      "the mock bonus caps at 15 points",
      {
        questions: [prepared("TECHNICAL"), prepared("TECHNICAL", false)],
        sessions: [session("COMPLETED", 80), session("COMPLETED", 65), session("COMPLETED", 100), session("COMPLETED", 90)],
        storyCount: 0,
        unansweredGaps: 0,
      },
      { overall: 65, technical: 50, completedSessions: 4 },
    ],
    [
      "only completed sessions with a passing score add a bonus",
      {
        questions: [prepared("TECHNICAL"), prepared("TECHNICAL", false)],
        sessions: [session("COMPLETED", 59), session("COMPLETED", null), session("ABANDONED", 90), session("IN_PROGRESS", 90)],
        storyCount: 0,
        unansweredGaps: 0,
      },
      { overall: 50, technical: 50, completedSessions: 2 },
    ],
    [
      "unanswered gaps subtract up to 10 points",
      {
        questions: [prepared("TECHNICAL"), prepared("TECHNICAL", false)],
        sessions: [],
        storyCount: 0,
        unansweredGaps: 7,
      },
      { overall: 40, technical: 50, completedSessions: 0 },
    ],
    [
      "three unanswered gaps subtract exactly 6 points",
      {
        questions: [prepared("TECHNICAL"), prepared("TECHNICAL", false)],
        sessions: [],
        storyCount: 0,
        unansweredGaps: 3,
      },
      { overall: 44, technical: 50, completedSessions: 0 },
    ],
    [
      "no questions means the base is zero; a passing mock still adds its bonus",
      {
        questions: [],
        sessions: [session("COMPLETED", 90)],
        storyCount: 0,
        unansweredGaps: 0,
      },
      { overall: 5, technical: 0, behavioral: 0, systemDesign: 0, preparedQuestions: 0, totalQuestions: 0, completedSessions: 1 },
    ],
  ])("%s", (_name, input, expected) => {
    expect(computeReadiness(input)).toMatchObject(expected);
  });

  it("never leaves the 0..100 range, whatever bonus and penalty add up to", () => {
    const allPrepared = { questions: [prepared("TECHNICAL")], sessions: [], storyCount: 0, unansweredGaps: 0 };
    // Base 100 plus three passing mocks would be 115 without the clamp.
    expect(computeReadiness({ ...allPrepared, sessions: [session(), session(), session()] }).overall).toBe(100);
    // Base 100 minus five gaps is 90, so the penalty still shows at the top.
    expect(computeReadiness({ ...allPrepared, unansweredGaps: 5 }).overall).toBe(90);
    // Nothing prepared with piles of gaps cannot go below zero.
    expect(computeReadiness({ ...allPrepared, questions: [prepared("TECHNICAL", false)], unansweredGaps: 99 }).overall).toBe(0);
  });

  it("bands the verdict in plain text", () => {
    const base50 = { questions: [prepared("TECHNICAL"), prepared("TECHNICAL", false)], sessions: [], storyCount: 0, unansweredGaps: 0 };
    const verdictFor = (input: Parameters<typeof computeReadiness>[0]) => computeReadiness(input).verdict;

    expect(verdictFor({ ...base50, questions: [prepared("TECHNICAL")] })).toMatch(/^Ready to interview/);
    expect(verdictFor({ ...base50, questions: [prepared("TECHNICAL")], unansweredGaps: 5 })).toMatch(/^Ready to interview/);
    expect(verdictFor({ ...base50, sessions: [session(), session(), session()] })).toMatch(/^Nearly ready/);
    expect(verdictFor({ ...base50, sessions: [session(), session()] })).toMatch(/^Nearly ready/);
    expect(verdictFor({ ...base50, sessions: [session()] })).toMatch(/^Getting there/);
    expect(verdictFor({ ...base50, unansweredGaps: 5 })).toMatch(/^Getting there/);
    expect(verdictFor({ ...base50, questions: [prepared("TECHNICAL"), prepared("TECHNICAL", false), prepared("SYSTEM_DESIGN", false)] })).toMatch(/^Early days/);
    expect(verdictFor({ ...base50, questions: [], unansweredGaps: 0 })).toMatch(/^Early days/);
  });
});
