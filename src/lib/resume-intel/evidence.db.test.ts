import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentKind } from "@/generated/prisma/enums";
import { createTestClient, resetDatabase } from "@/test/db";

import { evidenceForDocument, mapDocumentEvidence } from "./evidence";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

async function aDocument() {
  const application = await prisma().application.create({ data: { title: "Backend Engineer at Example Co" } });
  return prisma().document.create({ data: { applicationId: application.id, kind: DocumentKind.RESUME, units: [] } });
}

async function anAchievement(title: string) {
  // The Json columns have no default, so an empty row still lists them.
  return prisma().careerAchievement.create({ data: { title, technologies: [], metrics: [], tags: [], skills: [], versions: [] } });
}

describe("mapDocumentEvidence", () => {
  it("maps units to achievements that exist and skips ids that do not", async () => {
    const document = await aDocument();
    const first = await anAchievement("The checkout migration");
    const count = await mapDocumentEvidence(document.id, [
      { achievementId: first.id, unitId: "Experience:Ledgerly" },
      { achievementId: "no-such-achievement", unitId: "Experience:Ghost" },
    ]);
    expect(count).toBe(1);
    expect(await evidenceForDocument(document.id)).toEqual([
      { id: expect.any(String), achievementId: first.id, unitId: "Experience:Ledgerly", title: "The checkout migration", status: "IMPORTED" },
    ]);
  });

  it("replaces the whole set on the next mapping, not adds to it", async () => {
    const document = await aDocument();
    const first = await anAchievement("First");
    const second = await anAchievement("Second");
    await mapDocumentEvidence(document.id, [
      { achievementId: first.id, unitId: "Summary" },
      { achievementId: first.id, unitId: "Experience:Ledgerly" },
    ]);
    const count = await mapDocumentEvidence(document.id, [{ achievementId: second.id, unitId: "Skills" }]);
    expect(count).toBe(1);
    const evidence = await evidenceForDocument(document.id);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ achievementId: second.id, unitId: "Skills", title: "Second" });
    expect(await prisma().documentEvidence.count()).toBe(1);
  });

  it("clears the set when nothing valid is left", async () => {
    const document = await aDocument();
    const first = await anAchievement("First");
    await mapDocumentEvidence(document.id, [{ achievementId: first.id, unitId: "Summary" }]);
    expect(await mapDocumentEvidence(document.id, [{ achievementId: "gone", unitId: "Summary" }])).toBe(0);
    expect(await evidenceForDocument(document.id)).toEqual([]);
  });

  it("keeps one row per document, achievement and unit even with duplicates in the input", async () => {
    const document = await aDocument();
    const first = await anAchievement("First");
    const count = await mapDocumentEvidence(document.id, [
      { achievementId: first.id, unitId: "Summary" },
      { achievementId: first.id, unitId: "Summary" },
    ]);
    expect(count).toBe(1);
  });
});

describe("evidenceForDocument", () => {
  it("shows the achievement's title and status, so the display can warn about unverified claims", async () => {
    const document = await aDocument();
    const first = await anAchievement("Verified work");
    await prisma().careerAchievement.update({ where: { id: first.id }, data: { status: "VERIFIED" } });
    await mapDocumentEvidence(document.id, [{ achievementId: first.id, unitId: "Experience:Ledgerly" }]);

    const evidence = await evidenceForDocument(document.id);
    expect(evidence[0]).toMatchObject({ title: "Verified work", status: "VERIFIED", unitId: "Experience:Ledgerly" });
  });

  it("lists nothing for a document with no evidence", async () => {
    expect(await evidenceForDocument((await aDocument()).id)).toEqual([]);
  });
});
