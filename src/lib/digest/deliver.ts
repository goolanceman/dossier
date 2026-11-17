import "server-only";

import { dayOf } from "@/lib/calendar-view";
import { loadGoogleAccount } from "@/lib/google/account";
import { sendMail } from "@/lib/google/gmail";
import { logServerWarning } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings-data";
import { lastKnownTimeZone } from "@/lib/time-zone";

import { buildDigest, digestMarkdown, type Digest } from "./build";

// The digest's delivery (master.md Phase 15): one DigestRun per day, its id
// the day itself ("2026-11-17"). The Markdown and JSON exports are kept with
// it. Email is optional and off: when it's on and a Gmail account is
// connected, the digest goes from that account to the user's own address.
// Nothing else is ever sent on its own, and a send that didn't happen is
// never recorded (master.md §11.4).

/** The digest's day id for `now`, in the user's time zone. */
export async function digestDay(now = new Date()): Promise<string> {
  return dayOf(now, await lastKnownTimeZone());
}

/** Emails the digest from the connected Gmail account to its own address, and says whether it went. */
async function emailDigest(day: string, markdown: string): Promise<boolean> {
  const { digestEmailEnabled } = await loadSettings();
  if (!digestEmailEnabled) return false;
  const account = await loadGoogleAccount();
  if (!account) return false;
  try {
    await sendMail({ from: account.email, to: account.email, subject: `Dossier job digest for ${day}`, body: markdown });
    return true;
  } catch (error) {
    logServerWarning("digest", error instanceof Error ? error.message : "couldn't send the digest email");
    return false;
  }
}

/**
 * Builds the digest for the 24 hours before `now`, keeps it as the day's
 * DigestRun, and emails it while enabled and connected. Rebuilding the day
 * overwrites it; a recorded send is only replaced by a newer one.
 */
export async function deliverDigest(now = new Date()): Promise<{ id: string; digest: Digest; markdown: string; sentAt: Date | null }> {
  const day = await digestDay(now);
  const { digestIncludeMarkdown } = await loadSettings();
  const digest = await buildDigest(now);
  const markdown = digestIncludeMarkdown ? digestMarkdown(digest) : "";
  const sent = await emailDigest(day, markdown);
  const sentAt = sent ? new Date() : null;
  await prisma.digestRun.upsert({
    where: { id: day },
    create: { id: day, content: JSON.parse(digestJson(digest)), markdown, sentAt },
    update: { content: JSON.parse(digestJson(digest)), markdown, ...(sentAt ? { sentAt } : {}) },
  });
  return { id: day, digest, markdown, sentAt };
}

/** Marks the day's digest seen when the user opens it. A digest is only marked once. */
export async function markDigestSeen(id: string): Promise<void> {
  await prisma.digestRun.updateMany({ where: { id, seenAt: null }, data: { seenAt: new Date() } });
}

/** The digest as JSON, for the export. */
export function digestJson(digest: Digest): string {
  return JSON.stringify(digest, null, 2);
}
