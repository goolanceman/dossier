import { describe, expect, it } from "vitest";

import { EMPTY_MATCHES, CONTEXT_CHARS, MAX_MATCHES, keywordMatch, sentencesOf } from "./keyword";
import { EMPTY_CRITERIA } from "./profile";

const criteria = {
  ...EMPTY_CRITERIA,
  titles: ["Backend Engineer"],
  requiredTech: ["Node.js"],
  requiredKeywords: ["TypeScript"],
  preferredTech: ["Kafka", "GraphQL"],
};

const description = [
  "We build a large trading platform in Berlin.",
  "Our stack is Node.js and Postgres, written in TypeScript.",
  "Experience with Kafka is a plus.",
  "You will report to the Head of Engineering.",
].join("\n");

describe("sentencesOf", () => {
  it("splits on newlines and sentence ends", () => {
    expect(sentencesOf("One sentence. Two! Three? Four; five: six\neight")).toEqual(["One sentence.", "Two!", "Three?", "Four; five: six", "eight"]);
  });

  it("drops fragments and caps how many it reads", () => {
    expect(sentencesOf("x\nA proper sentence follows here.")).toEqual(["A proper sentence follows here."]);
    expect(sentencesOf(`${Array.from({ length: 2100 }, (_, index) => `Sentence number ${index}.`).join(" ")}`)).toHaveLength(2000);
  });
});

describe("keywordMatch", () => {
  it("collects the sentences that name required, preferred and title terms, with context", () => {
    const matches = keywordMatch(description, criteria);
    expect(matches.matchedRequired).toHaveLength(1);
    expect(matches.matchedRequired[0]).toContain("Node.js and Postgres");
    // A match keeps the sentence that follows it, up to the window's 200 characters.
    expect(matches.matchedPreferred[0]).toBe("Experience with Kafka is a plus. You will report to the Head of Engineering.");
    // "Backend Engineer" appears nowhere in the description, so no title match.
    expect(matches.matchedTitleTerms).toEqual([]);
    expect(matches.scoreHint).toBe(65); // required 2/2, title 0/1, preferred 1/2, weighted 55/25/20
  });

  it("keeps context windows to 200 characters", () => {
    const long = Array.from({ length: 10 }, (_, index) => `Sentence ${index} talks about Node.js at length in one very long line of text.`).join(" ");
    const matches = keywordMatch(long, criteria);
    expect(matches.matchedRequired).toHaveLength(1);
    expect(matches.matchedRequired[0]!.length).toBeLessThanOrEqual(CONTEXT_CHARS);
  });

  it("matches title terms wherever they appear", () => {
    const matches = keywordMatch("The Backend Engineer owns our services. They also touch GraphQL.", criteria);
    expect(matches.matchedTitleTerms[0]).toBe("The Backend Engineer owns our services. They also touch GraphQL.");
    expect(matches.matchedPreferred).toHaveLength(1);
  });

  it("scores the coverage it has, and hands the weight of empty groups to the others", () => {
    // All required terms, none of the rest: 55% of the weight.
    expect(keywordMatch("Fluent in TypeScript and Node.js.", criteria).scoreHint).toBe(55);
    // All preferred terms: 20% of the weight.
    expect(keywordMatch("Experience with Kafka and GraphQL.", criteria).scoreHint).toBe(20);
    expect(keywordMatch("Experience with Kafka.", criteria).scoreHint).toBe(10);
    // A group with no terms hands its weight to the others: 55 of 80, renormalized.
    expect(keywordMatch("Fluent in TypeScript and Node.js.", { ...criteria, preferredTech: [] }).scoreHint).toBe(69);
    // Nothing matched: zero.
    expect(keywordMatch("A description about nothing relevant.", criteria).scoreHint).toBe(0);
  });

  it("matches case-insensitively and treats missing criteria as an empty match", () => {
    expect(keywordMatch("NODE.JS engineers wanted, TypeScript too.", criteria).matchedRequired.length).toBeGreaterThan(0);
    expect(keywordMatch("Anything at all.", EMPTY_CRITERIA)).toEqual(EMPTY_MATCHES);
    expect(EMPTY_MATCHES).toEqual({ matchedRequired: [], matchedPreferred: [], matchedTitleTerms: [], scoreHint: 0 });
  });

  it("caps how many matches each list keeps", () => {
    const many = Array.from({ length: 30 }, (_, index) => `Role ${index} needs Node.js and TypeScript.`).join(" ");
    const matches = keywordMatch(many, criteria);
    expect(matches.matchedRequired.length).toBeLessThanOrEqual(MAX_MATCHES);
    expect(MAX_MATCHES).toBe(10);
  });
});
