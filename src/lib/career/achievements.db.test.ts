import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EvidenceStatus } from "@/generated/prisma/enums";
import { createTestClient, resetDatabase } from "@/test/db";

import {
  achievementsForPrompt,
  assertUserStatus,
  createAchievement,
  deleteAchievement,
  getAchievement,
  listAchievements,
  promoteToVerified,
  reorderAchievements,
  setStatus,
  updateAchievement,
  verifiedAchievementIds,
} from "./achievements";
import { createTarget } from "./targets";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

const ledgerly = {
  title: "Ledgerly migration",
  description: "Moved billing to an event-driven pipeline",
  company: "Northwind",
  technologies: ["Postgres", "Kafka"],
  metrics: ["p99 latency -40%"],
  tags: ["backend", "migration"],
  skills: ["Postgres"],
};

describe("achievements", () => {
  it("creates with empty defaults, keeps origin, and appends to the list", async () => {
    const first = await createAchievement({ title: "Ledgerly migration" }, { origin: "resume" });
    expect(first).toMatchObject({ title: "Ledgerly migration", description: "", status: "IMPORTED", origin: "resume", technologies: [], sort: 0 });
    const second = await createAchievement(ledgerly, { origin: "" });
    expect(second).toMatchObject({ sort: 1, status: "IMPORTED", metrics: ["p99 latency -40%"], skills: ["Postgres"] });
  });

  it("keeps the evidence hierarchy: AI paths can never set VERIFIED, USER_CONFIRMED or REJECTED", async () => {
    expect(() => assertUserStatus(EvidenceStatus.VERIFIED)).toThrow("Only the user can set an achievement to VERIFIED");
    expect(() => assertUserStatus(EvidenceStatus.REJECTED)).toThrow();
    expect(() => assertUserStatus(EvidenceStatus.IMPORTED)).not.toThrow();
    expect(() => assertUserStatus(EvidenceStatus.NEEDS_CLARIFICATION)).not.toThrow();

    await expect(createAchievement({ title: "X", status: EvidenceStatus.VERIFIED }, { origin: "ai" })).rejects.toThrow("Only the user");
    const created = await createAchievement({ title: "X", status: EvidenceStatus.NEEDS_CLARIFICATION }, { origin: "ai" });
    expect(created.status).toBe("NEEDS_CLARIFICATION");
    await expect(updateAchievement(created.id, { status: EvidenceStatus.USER_CONFIRMED })).rejects.toThrow("Only the user");
  });

  it("the user's paths can set any status: promoteToVerified and setStatus", async () => {
    const created = await createAchievement({ title: "Ledgerly migration" }, { origin: "" });
    expect((await promoteToVerified(created.id)).status).toBe("VERIFIED");
    expect((await setStatus(created.id, EvidenceStatus.REJECTED)).status).toBe("REJECTED");
    expect((await setStatus(created.id, EvidenceStatus.USER_CONFIRMED)).status).toBe("USER_CONFIRMED");
  });

  it("updates only the given fields and keeps the rest", async () => {
    const created = await createAchievement(ledgerly, { origin: "" });
    const updated = await updateAchievement(created.id, { outcome: "Billing runs on time", metrics: ["p99 latency -40%", "0 missed invoices"] });
    expect(updated).toMatchObject({ title: "Ledgerly migration", company: "Northwind", outcome: "Billing runs on time", metrics: ["p99 latency -40%", "0 missed invoices"] });
    expect((await getAchievement(created.id))?.technologies).toEqual(["Postgres", "Kafka"]);
  });

  it("lists in list order, filtered by status, skill, query and target keywords", async () => {
    const migration = await createAchievement(ledgerly, { origin: "" });
    await createAchievement({ title: "Design system", description: "Rebuilt the component library", technologies: ["Figma"], tags: ["frontend"], skills: ["Figma"] }, { origin: "" });
    await createAchievement({ title: "Team lead", description: "Led the platform team", status: EvidenceStatus.NEEDS_CLARIFICATION }, { origin: "" });

    expect((await listAchievements()).map((a) => a.title)).toEqual(["Ledgerly migration", "Design system", "Team lead"]);
    expect((await listAchievements({ status: EvidenceStatus.NEEDS_CLARIFICATION })).map((a) => a.title)).toEqual(["Team lead"]);
    expect((await listAchievements({ skill: "Figma" })).map((a) => a.title)).toEqual(["Design system"]);
    expect((await listAchievements({ query: "pipeline" })).map((a) => a.title)).toEqual(["Ledgerly migration"]);
    expect((await listAchievements({ query: "PIPELINE" })).map((a) => a.title)).toEqual(["Ledgerly migration"]);
    expect((await listAchievements({ query: "billing" })).map((a) => a.title)).toEqual(["Ledgerly migration"]);
    expect(await listAchievements({ query: "nothing matches this" })).toEqual([]);

    await createTarget({ title: "Staff Backend Engineer", preferences: { keywords: ["kafka", "postgres"] } });
    expect((await listAchievements({ targetTitle: "Staff Backend Engineer" })).map((a) => a.id)).toEqual([migration.id]);
    expect(await listAchievements({ targetTitle: "Product Designer" })).toEqual([]);
  });

  it("reorders the list", async () => {
    const a = await createAchievement({ title: "A" }, { origin: "" });
    const b = await createAchievement({ title: "B" }, { origin: "" });
    const c = await createAchievement({ title: "C" }, { origin: "" });
    await reorderAchievements([c.id, a.id, b.id]);
    expect((await listAchievements()).map((a) => a.title)).toEqual(["C", "A", "B"]);
  });

  it("deletes", async () => {
    const created = await createAchievement({ title: "A" }, { origin: "" });
    await deleteAchievement(created.id);
    expect(await getAchievement(created.id)).toBeNull();
  });

  it("verifiedAchievementIds keeps ids that exist and are not REJECTED, with one query", async () => {
    const kept = await createAchievement(ledgerly, { origin: "" });
    const rejected = await createAchievement({ title: "Exaggeration" }, { origin: "" });
    await setStatus(rejected.id, EvidenceStatus.REJECTED);
    expect(await verifiedAchievementIds([kept.id, rejected.id, "missing-id"])).toEqual([kept.id]);
    expect(await verifiedAchievementIds([])).toEqual([]);
  });

  it("achievementsForPrompt gives compact JSON without internal fields", async () => {
    const created = await createAchievement(ledgerly, { origin: "" });
    const prompt = JSON.parse(await achievementsForPrompt([created.id, "missing-id"]));
    expect(prompt).toEqual([{ id: created.id, title: "Ledgerly migration", company: "Northwind", metrics: ["p99 latency -40%"], technologies: ["Postgres", "Kafka"], status: "IMPORTED" }]);
    expect(await achievementsForPrompt([])).toBe("[]");
  });
});
