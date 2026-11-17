import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { unitsSchema } from "@/lib/application-data";
import { demoProfile } from "@/lib/demo-profile";
import { createTestClient, resetDatabase } from "@/test/db";

import { getMasterDocument, getMasterDocumentById, masterUnitsFromProfile, saveMasterDocument, validateAppliedUnits } from "./master";

// The master resume (master.md §5.5): its units build from the profile with
// the tailoring flow's ids, it saves as the one applicationless resume with
// a version each time, and applied findings are checked by the fact guard.

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

describe("masterUnitsFromProfile", () => {
  it("builds the same sections, ids and labels the tailoring flow edits by", () => {
    const profile = demoProfile();
    const units = masterUnitsFromProfile(profile);
    // Parsing here is what saveMasterDocument repeats before storing.
    expect(() => unitsSchema.parse(units)).not.toThrow();
    expect(units[0]).toEqual({ id: "summary", label: "Summary", text: profile.basics.summary });
    expect(units.filter((unit) => unit.id.startsWith("experience:")).map((unit) => unit.id)).toEqual(profile.experience.map((entry) => `experience:${entry.id}`));
    expect(units.find((unit) => unit.id === "experience:e1")?.label).toBe("Northwind Logistics role");
    expect(units.find((unit) => unit.id === "project:p1")?.label).toBe("Tidewater design tokens project");
    expect(units.find((unit) => unit.id === "skills")).toMatchObject({ id: "skills", label: "Skills" });
    expect(units.find((unit) => unit.id === "education:d1")).toMatchObject({ id: "education:d1", label: "MSc Design for Interaction" });
    expect(units.find((unit) => unit.id === "certification:c1")?.label).toBe("Certification “Certified Accessibility Specialist”");
    expect(units.find((unit) => unit.id === "publication:u1")?.label).toMatch(/^Publication /);
    expect(units.at(-1)).toMatchObject({ id: "languages", label: "Languages" });
  });
});

describe("saveMasterDocument", () => {
  it("creates the master resume once, then updates it in place, a version row each time", async () => {
    const units = masterUnitsFromProfile(demoProfile());
    const first = await saveMasterDocument(units);
    expect(first).toMatchObject({ applicationId: null, kind: "RESUME", themeId: null });
    expect(first.units).toEqual(units);

    const again = await saveMasterDocument([{ id: "summary", label: "Summary", text: "Rebuilt from the profile." }]);
    expect(again.id).toBe(first.id);
    expect(await prisma().document.count({ where: { applicationId: null, kind: "RESUME" } })).toBe(1);
    const versions = await prisma().documentVersion.findMany({ where: { documentId: first.id }, orderBy: { createdAt: "asc" } });
    expect(versions.map((version) => [version.cause, version.detail])).toEqual([
      ["REGENERATED", "Master resume updated"],
      ["REGENERATED", "Master resume updated"],
    ]);
  });

  it("keeps the theme it's given, and keeps it when a later save passes none", async () => {
    const theme = await prisma().theme.create({ data: { name: "Slate", headFont: "NEWSREADER", bodyFont: "NEWSREADER", accent: "#0f0f0f" } });
    const saved = await saveMasterDocument([{ id: "summary", label: "Summary", text: "One." }], { themeId: theme.id });
    expect(saved.themeId).toBe(theme.id);
    const kept = await saveMasterDocument([{ id: "summary", label: "Summary", text: "Two." }]);
    expect(kept.themeId).toBe(theme.id);
  });

  it("marks the critique whose findings were applied, and says so in the version", async () => {
    const critique = await prisma().resumeCritique.create({
      data: { overall: { score: 60, atsReadiness: "GOOD", summary: "Solid core." }, findings: [], keywordCoverage: [], formattingIssues: [], critiquedWith: "resume-critique@1" },
    });
    const document = await saveMasterDocument([{ id: "summary", label: "Summary", text: "Applied." }], { critiqueId: critique.id });
    expect((await prisma().resumeCritique.findUnique({ where: { id: critique.id } }))?.appliedDocumentId).toBe(document.id);
    const version = await prisma().documentVersion.findFirst({ where: { documentId: document.id } });
    expect(version).toMatchObject({ cause: "REGENERATED", detail: "Applied critique findings" });
  });

  it("refuses units that don't answer to unitsSchema", async () => {
    await expect(
      saveMasterDocument([
        { id: "summary", label: "Summary", text: "One." },
        { id: "summary", label: "Summary", text: "Two." },
      ]),
    ).rejects.toThrow();
    expect(await prisma().document.count()).toBe(0);
  });

  it("reads the master resume back by itself", async () => {
    const saved = await saveMasterDocument([{ id: "summary", label: "Summary", text: "The master." }]);
    expect((await getMasterDocument())?.id).toBe(saved.id);
    expect((await getMasterDocumentById(saved.id))?.id).toBe(saved.id);
  });
});

describe("validateAppliedUnits", () => {
  it("flags the unit whose numbers and names the profile doesn't back", () => {
    const problems = validateAppliedUnits([{ id: "experience:e1", label: "Northwind Logistics role", text: "Cut onboarding time by 47% at Meridian Health." }], demoProfile());
    expect(problems).toHaveLength(1);
    expect(problems[0].unitId).toBe("experience:e1");
    expect(problems[0].problem).toContain("47");
  });

  it("passes the profile's own words: a master resume built from the profile is fully backed", () => {
    const profile = demoProfile();
    expect(validateAppliedUnits(masterUnitsFromProfile(profile), profile)).toEqual([]);
  });
});
