import "server-only";

import { dayOf } from "@/lib/calendar-view";
import { zonedTime } from "@/lib/google/slots";
import { logServerError } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings-data";
import { lastKnownTimeZone } from "@/lib/time-zone";

import { deliverDigest } from "./deliver";

// The digest's daily run (master.md Phase 15): a timer in this process, like
// the job agent's and the backups', so it's only right with one instance.
// Every 5 minutes it builds the day's digest once the chosen hour has come,
// in the user's time zone, and today's DigestRun doesn't exist yet.

const EVERY_MS = 5 * 60 * 1000;

/** The moment the digest is due on `day`, at `hour` in `timeZone`. */
const dueOn = (day: string, hour: number, timeZone: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return zonedTime(year, month, date, hour, 0, timeZone);
};

/** Whether the digest should be built now: the hour has come and today's isn't built. */
export function digestDue(now: Date, hour: number, timeZone: string, builtToday: boolean): boolean {
  return !builtToday && now >= dueOn(dayOf(now, timeZone), hour, timeZone);
}

/** Builds the day's digest when it's due. Says whether it did. */
export async function startDueDigest(now = new Date()): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.digestEnabled) return false;
  const timeZone = await lastKnownTimeZone();
  const existing = await prisma.digestRun.findUnique({ where: { id: dayOf(now, timeZone) }, select: { id: true } });
  if (!digestDue(now, settings.digestHour, timeZone, existing !== null)) return false;
  await deliverDigest(now);
  return true;
}

const globalForDigest = globalThis as unknown as { digestTimer?: ReturnType<typeof setInterval> };

/** Starts the timer, once per process (dev reloads keep the one they have). */
export function startDigestSchedule(): void {
  if (globalForDigest.digestTimer) return;
  const check = () => void startDueDigest().catch((error: unknown) => logServerError("digest schedule", error));
  globalForDigest.digestTimer = setInterval(check, EVERY_MS);
  // Don't keep the process alive just for this.
  globalForDigest.digestTimer.unref?.();
  check();
}
