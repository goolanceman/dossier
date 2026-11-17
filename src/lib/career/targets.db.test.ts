import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { createTarget, deleteTarget, getTarget, listTargets, reorderTargets, updateTarget } from "./targets";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

describe("targets", () => {
  it("makes the first target primary automatically and the others follow", async () => {
    const first = await createTarget({ title: "Staff Backend Engineer" });
    expect(first).toMatchObject({
      title: "Staff Backend Engineer",
      summary: "",
      primary: true,
      preferences: { seniority: "", salaryMin: null, currency: "EUR", remoteCountries: [], priorities: [], keywords: [] },
    });
    const second = await createTarget({ title: "Staff Frontend Engineer", preferences: { seniority: "STAFF", salaryMin: 90_000 } });
    expect(second).toMatchObject({ primary: false, preferences: { seniority: "STAFF", salaryMin: 90_000, currency: "EUR" } });
    expect((await listTargets()).map((t) => t.title)).toEqual(["Staff Backend Engineer", "Staff Frontend Engineer"]);
  });

  it("keeps only one primary: making a target primary demotes the old one", async () => {
    const first = await createTarget({ title: "Staff Backend Engineer" });
    const second = await createTarget({ title: "Engineering Manager" });
    const moved = await updateTarget(second.id, { primary: true });
    expect(moved.primary).toBe(true);
    expect((await getTarget(first.id))?.primary).toBe(false);
    expect((await listTargets()).filter((t) => t.primary).map((t) => t.title)).toEqual(["Engineering Manager"]);

    await updateTarget(second.id, { primary: false });
    expect(await listTargets().then((targets) => targets.filter((t) => t.primary))).toEqual([]);
  });

  it("updates only the given fields and merges partial preferences", async () => {
    const target = await createTarget({ title: "Staff Backend Engineer", preferences: { keywords: ["go"], currency: "USD" } });
    const updated = await updateTarget(target.id, { summary: "Distributed systems", preferences: { salaryMin: 100_000 } });
    expect(updated).toMatchObject({ title: "Staff Backend Engineer", summary: "Distributed systems" });
    expect(updated.preferences).toEqual({ seniority: "", salaryMin: 100_000, currency: "USD", remoteCountries: [], priorities: [], keywords: ["go"] });
  });

  it("reorders and deletes", async () => {
    const a = await createTarget({ title: "Backend" });
    const b = await createTarget({ title: "Manager" });
    // Reorder shows below the primary, so take a out of primary first.
    await updateTarget(a.id, { primary: false });
    await reorderTargets([b.id, a.id]);
    expect((await listTargets()).map((t) => t.title)).toEqual(["Manager", "Backend"]);

    await deleteTarget(b.id);
    expect(await getTarget(b.id)).toBeNull();
    expect((await listTargets()).map((t) => t.title)).toEqual(["Backend"]);
  });
});
