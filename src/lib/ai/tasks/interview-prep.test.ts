import { describe, expect, it } from "vitest";

import { demoProfile } from "@/lib/demo-profile";

import type { ChatCall } from "../provider";
import { MockProvider } from "../providers/mock";

import { interviewPrep, interviewPrepFrom, INTERVIEW_PREP_VERSION } from "./interview-prep";

const profile = demoProfile();
const options = { creativity: "FAITHFUL" as const, strict: true, language: null };
const achievements = [{ id: "ach-1", title: "Cut Ledgerly's p99 latency", summary: "Halved checkout latency at Northwind Logistics" }];
const input = {
  title: "Senior Backend Engineer",
  company: "Ledgerly",
  posting: "Ledgerly is hiring a Senior Backend Engineer with payments and Postgres experience.",
  profile,
  achievements,
  stage: "technical",
};
const answer = {
  schema_version: "1.0" as const,
  task: "interview_preparation" as const,
  role: "Senior Backend Engineer",
  questions: [
    {
      id: "q1",
      category: "SYSTEM_DESIGN" as const,
      difficulty: "SENIOR" as const,
      question: "How would you keep a payment flow responsive under load?",
      whyAsked: "The role owns latency-sensitive flows.",
      relatedRequirement: "payments experience",
      expectedTopics: ["Queueing", "Backpressure"],
      answerStructure: ["Name the constraint", "One story with numbers"],
      evidenceIds: ["ach-1", "ach-invented"],
      followUps: ["What broke first?"],
      commonMistakes: ["Naming no numbers"],
      resources: ["Postgres query plans", "https://invented.example.com/prep"],
    },
    { id: "q2", category: "TECHNICAL" as const, difficulty: "ADVANCED" as const, question: "", whyAsked: "", relatedRequirement: "", expectedTopics: [], answerStructure: [], evidenceIds: [], followUps: [], commonMistakes: [], resources: [] },
  ],
  preparationTopics: ["Payment flows", "ftp://also-dropped.example.com"],
  readiness: { score: 72, confidence: "MEDIUM" as const, reasoning: "Strong backend depth, no payments on record." },
};
const sent = (provider: MockProvider): ChatCall => provider.calls[0];

describe("interviewPrep", () => {
  it("says the questions are predicted, and sends the achievements by id", async () => {
    const provider = new MockProvider({ reply: () => answer });
    const { data, promptVersion } = await interviewPrep(provider, input, options);
    expect(promptVersion).toBe(INTERVIEW_PREP_VERSION);
    expect(data.questions).toHaveLength(1);

    const call = sent(provider);
    const text = [call.system, ...call.messages.map((message) => message.content)].join("\n");
    expect(call.json?.name).toBe("interview_preparation");
    expect(call.system).toMatch(/PREDICTED and REPRESENTATIVE/);
    expect(call.system).toMatch(/never the company's actual questions/);
    expect(text).toContain('"id": "ach-1"');
    expect(text).toContain("technical");
  });

  it("trusts nothing in the answer: evidence ids only from the library, resources never as URLs", () => {
    const cleaned = interviewPrepFrom(answer, achievements.map((achievement) => achievement.id));
    expect(cleaned.questions).toHaveLength(1);
    expect(cleaned.questions[0].evidenceIds).toEqual(["ach-1"]);
    expect(cleaned.questions[0].resources).toEqual(["Postgres query plans"]);
    expect(cleaned.preparationTopics).toEqual(["Payment flows"]);
  });
});
