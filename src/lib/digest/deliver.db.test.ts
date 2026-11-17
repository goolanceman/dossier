import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { dayOf } from "@/lib/calendar-view";
import { serverTimeZone } from "@/lib/time-zone";
import { saveSettings } from "@/lib/settings-data";
import { createTestClient, resetDatabase } from "@/test/db";

import { loadGoogleAccount } from "@/lib/google/account";
import { sendMail } from "@/lib/google/gmail";

import { deliverDigest, digestJson, markDigestSeen } from "./deliver";

// The delivery keeps one DigestRun per day, its Markdown export with it, and
// records an email send only when one really went out. The send reuses the
// Gmail integration: from the connected account to its own address.

const db = vi.hoisted(() => ({ client: undefined as ReturnType<typeof createTestClient> | undefined }));
vi.mock("@/lib/prisma", async () => {
  const { createTestClient } = await import("@/test/db");
  db.client = createTestClient();
  return { prisma: db.client };
});
vi.mock("@/lib/google/account", () => ({ loadGoogleAccount: vi.fn() }));
vi.mock("@/lib/google/gmail", () => ({ sendMail: vi.fn() }));

const prisma = () => db.client!;
const today = () => dayOf(new Date(), serverTimeZone());
/** The connected account as loadGoogleAccount reads it: only what the email uses. */
const account = () => ({ id: "google", email: "me@gmail.com", refreshTokenEnc: "enc", scopes: "send", historyId: null, lastSyncAt: null, syncProblem: null, createdAt: new Date(), updatedAt: new Date() });

beforeEach(async () => {
  await resetDatabase(prisma());
  vi.mocked(loadGoogleAccount).mockReset().mockResolvedValue(null);
  vi.mocked(sendMail).mockReset().mockResolvedValue({ id: "g1", threadId: "t1" });
});
afterAll(() => prisma().$disconnect());

describe("deliverDigest", () => {
  it("builds and keeps the day's digest, with its Markdown", async () => {
    const delivered = await deliverDigest();
    expect(delivered.id).toBe(today());
    expect(delivered.markdown).toContain("# Daily job digest");
    const run = await prisma().digestRun.findUnique({ where: { id: today() } });
    expect(run).not.toBeNull();
    expect(run!.markdown).toContain("# Daily job digest");
    expect(run!.content).toMatchObject({ counts: { discovered: 0 }, nextActions: [] });
    expect(run!.sentAt).toBeNull();
  });

  it("leaves the Markdown out while the export is switched off", async () => {
    await saveSettings({ digestIncludeMarkdown: false });
    const delivered = await deliverDigest();
    expect(delivered.markdown).toBe("");
    expect((await prisma().digestRun.findUnique({ where: { id: today() } }))!.markdown).toBe("");
  });

  it("emails it only while enabled and connected, and records the send", async () => {
    // Not connected: no send, however switched on the email is.
    await saveSettings({ digestEmailEnabled: true });
    await deliverDigest();
    expect(sendMail).not.toHaveBeenCalled();

    vi.mocked(loadGoogleAccount).mockResolvedValue(account());
    const delivered = await deliverDigest();
    expect(sendMail).toHaveBeenCalledWith({ from: "me@gmail.com", to: "me@gmail.com", subject: `Dossier job digest for ${today()}`, body: delivered.markdown });
    expect(delivered.sentAt).not.toBeNull();
    expect((await prisma().digestRun.findUnique({ where: { id: today() } }))!.sentAt).not.toBeNull();
  });

  it("never records a send that failed", async () => {
    await saveSettings({ digestEmailEnabled: true });
    vi.mocked(loadGoogleAccount).mockResolvedValue(account());
    vi.mocked(sendMail).mockRejectedValue(new Error("Gmail is down"));

    const delivered = await deliverDigest();
    expect(sendMail).toHaveBeenCalledOnce();
    expect(delivered.sentAt).toBeNull();
    expect((await prisma().digestRun.findUnique({ where: { id: today() } }))!.sentAt).toBeNull();
  });

  it("rebuilding the day never erases the send on record", async () => {
    await saveSettings({ digestEmailEnabled: true });
    vi.mocked(loadGoogleAccount).mockResolvedValue(account());
    await deliverDigest();

    // The account is gone: no send, but the one on record stays.
    vi.mocked(loadGoogleAccount).mockResolvedValue(null);
    await deliverDigest();
    expect((await prisma().digestRun.findUnique({ where: { id: today() } }))!.sentAt).not.toBeNull();
  });
});

describe("markDigestSeen", () => {
  it("marks the day's digest seen once, when the user opens it", async () => {
    await deliverDigest();
    const first = await prisma().digestRun.findUnique({ where: { id: today() } });
    expect(first!.seenAt).toBeNull();

    await markDigestSeen(today());
    const seen = await prisma().digestRun.findUnique({ where: { id: today() } });
    expect(seen!.seenAt).not.toBeNull();

    await markDigestSeen(today());
    expect((await prisma().digestRun.findUnique({ where: { id: today() } }))!.seenAt).toEqual(seen!.seenAt);
  });
});

describe("digestJson", () => {
  it("is pretty JSON of the digest", async () => {
    const delivered = await deliverDigest();
    const parsed = JSON.parse(digestJson(delivered.digest));
    expect(parsed).toEqual(delivered.digest);
    expect(digestJson(delivered.digest)).toContain("\n  \"counts\"");
  });
});
