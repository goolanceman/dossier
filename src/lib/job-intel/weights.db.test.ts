import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { DEFAULT_WEIGHTS, loadWeights, saveWeights, WEIGHTS_SETTING_KEY, type Weights } from "./weights";

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
const prisma = () => db.client!;

beforeEach(() => resetDatabase(prisma()));
afterAll(() => prisma().$disconnect());

describe("weights settings", () => {
  it("falls back to the defaults when nothing is stored", async () => {
    expect(await loadWeights()).toEqual(DEFAULT_WEIGHTS);
  });

  it("saves the weights and reads them back", async () => {
    const weights: Weights = { ...DEFAULT_WEIGHTS, technicalSkills: 20, seniority: 15 };
    expect(await saveWeights(weights)).toEqual(weights);
    const stored = await prisma().setting.findUniqueOrThrow({ where: { key: WEIGHTS_SETTING_KEY } });
    expect(JSON.parse(stored.value)).toEqual(weights);
    expect(await loadWeights()).toEqual(weights);
  });

  it("refuses weights that do not add up to exactly 100", async () => {
    await expect(saveWeights({ ...DEFAULT_WEIGHTS, domain: 6 })).rejects.toThrow("exactly 100");
    expect(await prisma().setting.findUnique({ where: { key: WEIGHTS_SETTING_KEY } })).toBeNull();
  });

  it("falls back to the defaults when the stored setting is broken", async () => {
    await prisma().setting.create({ data: { key: WEIGHTS_SETTING_KEY, value: "{not json" } });
    expect(await loadWeights()).toEqual(DEFAULT_WEIGHTS);
    await prisma().setting.update({ where: { key: WEIGHTS_SETTING_KEY }, data: { value: JSON.stringify({ ...DEFAULT_WEIGHTS, domain: 50 }) } });
    expect(await loadWeights()).toEqual(DEFAULT_WEIGHTS);
  });
});
