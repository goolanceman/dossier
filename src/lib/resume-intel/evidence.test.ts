import { describe, expect, it } from "vitest";

import { validateTailoredUnits } from "./evidence";

const units = (texts: string[]) => texts.map((text, index) => ({ id: `unit-${index}`, text }));

describe("validateTailoredUnits", () => {
  it("flags numbered units with no evidence in strict mode", () => {
    const { violations } = validateTailoredUnits(units(["Led a team of 8 engineers.", "Built the ingestion pipeline."]), [], true);
    expect(violations).toEqual([
      { unitId: "unit-0", problem: "This unit states numbers, but no evidence is mapped to it. Map an achievement or remove the numbers." },
    ]);
  });

  it("passes numbered units that have an evidence mapping for their id", () => {
    const evidence = [{ achievementId: "ach-1", unitId: "unit-0" }];
    expect(validateTailoredUnits(units(["Cut p99 latency 40% across checkout."]), evidence, true).violations).toEqual([]);
  });

  it.each([
    "Shipped on 2024-03-01 for the platform team.",
    "Worked there from 31/01/2021 to 2024.",
    "Promoted in January 2022, later in Feb. 2023.",
    "Between 2019-2023 I led the rewrite.",
  ])("ignores numbers that only appear in a date: %s", (text) => {
    expect(validateTailoredUnits(units([text]), [], true).violations).toEqual([]);
  });

  it("still wants evidence when a date and a metric share the unit", () => {
    const { violations } = validateTailoredUnits(units(["From 2022 to 2024 I grew revenue by 35%."]), [], true);
    expect(violations.map(({ unitId }) => unitId)).toEqual(["unit-0"]);
  });

  it("never scans the unit id, which may carry numbering", () => {
    const numbered = [{ id: "paragraph:1", text: "Owned the payments migration." }];
    expect(validateTailoredUnits(numbered, [], true).violations).toEqual([]);
  });

  it("flags nothing outside strict mode", () => {
    expect(validateTailoredUnits(units(["Grew revenue by 35%."]), [], false).violations).toEqual([]);
  });

  it("only requires one mapping among several, and reports every violating unit", () => {
    const evidence = [{ achievementId: "ach-1", unitId: "unit-1" }, { achievementId: "ach-2", unitId: "unit-1" }];
    const { violations } = validateTailoredUnits(units(["40% faster.", "5 engineers, 3 services."]), evidence, true);
    expect(violations.map(({ unitId }) => unitId)).toEqual(["unit-0"]);
  });
});
