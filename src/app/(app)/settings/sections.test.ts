import { describe, expect, it } from "vitest";

import { ROUTING_TASKS, SETTINGS_SECTIONS, settingsSectionFromParam, settingsSectionHref, TASK_KEYS } from "./sections";

describe("settings sections", () => {
  it("reads the section from the URL, defaulting to AI provider", () => {
    expect(settingsSectionFromParam("data")).toBe("data");
    expect(settingsSectionFromParam(undefined)).toBe("ai");
    expect(settingsSectionFromParam("nope")).toBe("ai");
    expect(settingsSectionFromParam(["about", "data"])).toBe("ai");
    // The MCP connector's old name (#281).
    expect(settingsSectionFromParam("claude")).toBe("connector");
  });

  it("links to a section", () => {
    expect(settingsSectionHref("documents")).toBe("/settings?section=documents");
  });

  it("sits the AI models & usage section after AI provider (master.md §11.3), and Automation after the job agent (Phase 15)", () => {
    const ids = SETTINGS_SECTIONS.map((section) => section.id);
    expect(ids.indexOf("ai-routing")).toBe(ids.indexOf("ai") + 1);
    expect(ids.indexOf("automation")).toBe(ids.indexOf("agent") + 1);
    expect(settingsSectionFromParam("ai-routing")).toBe("ai-routing");
    expect(settingsSectionFromParam("automation")).toBe("automation");
    expect(settingsSectionHref("ai-routing")).toBe("/settings?section=ai-routing");
    expect(settingsSectionHref("automation")).toBe("/settings?section=automation");
  });

  it("has a routing row for every AI task the app runs (master.md §11.3)", () => {
    expect(TASK_KEYS).toEqual([
      "screen-posting",
      "assess-job",
      "salary-research",
      "gap-questions",
      "resume-critique",
      "doc-findings",
      "interview-prep",
      "mock-feedback",
      "learning-plan",
      "company-research",
    ]);
    for (const task of ROUTING_TASKS) expect(task.label).toBeTruthy();
    for (const task of ROUTING_TASKS) expect(task.description).toBeTruthy();
  });
});
