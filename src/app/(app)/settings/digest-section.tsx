"use client";

import Link from "next/link";
import { useState } from "react";

import { useTrackSave } from "@/components/save-tracker";
import { toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";

import { previewDigest, saveDigestSettings } from "./actions";
import { SettingsSectionIntro } from "./settings-screen";

export type DigestSettings = {
  enabled: boolean;
  hour: number;
  includeMarkdown: boolean;
  emailEnabled: boolean;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/**
 * Settings → Automation (master.md Phase 15): the daily digest and how it
 * reaches the user. Each change saves at once. The preview is built on the
 * server from today's data, without keeping or sending it.
 */
export function DigestSection({ initial, emailAvailable, timeZone }: {
  initial: DigestSettings;
  /** Whether the connected Gmail account may send; only then can the digest be emailed. */
  emailAvailable: boolean;
  /** The user's time zone, which the hour is in. */
  timeZone: string;
}) {
  const track = useTrackSave();
  const [settings, setSettings] = useState(initial);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const change = (next: Partial<DigestSettings>) => {
    const previous = settings;
    setSettings({ ...settings, ...next });
    void track(saveDigestSettings(next)).then((result) => {
      if (!toastResult(result).ok) setSettings(previous);
    });
  };

  const runPreview = async () => {
    if (previewing) return;
    setPreviewing(true);
    const result = await previewDigest({});
    setPreviewing(false);
    if (result.ok) setPreview(result.data.markdown);
    else toastResult(result);
  };

  return (
    <>
      <SettingsSectionIntro title="Automation">
        Once a day the digest gathers what discovery found, the best matches, new salary figures and the questions waiting for you, and keeps it for the day. It
        never sends anything but itself, and the email only when you turn it on.
      </SettingsSectionIntro>

      <Card padding="none" className="px-7 py-4">
        <Toggle
          label="Build the daily digest"
          description={
            settings.enabled
              ? `On. It's built once a day after ${clock(settings.hour)} your time (${timeZone}), from the last 24 hours.`
              : "Off. Nothing is built until it's on."
          }
          checked={settings.enabled}
          onCheckedChange={(enabled) => change({ enabled })}
        />
      </Card>

      <Card padding="none" className="grid gap-x-[18px] gap-y-5 px-7 py-[26px] sm:grid-cols-2">
        <Select
          label="Built after"
          hint={`Your time (${timeZone})`}
          value={String(settings.hour)}
          onChange={(event) => change({ hour: Number(event.target.value) })}
        >
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {clock(hour)}
            </option>
          ))}
        </Select>
        <Toggle
          className="sm:col-span-2"
          label="Keep each digest as Markdown"
          description={
            settings.includeMarkdown
              ? "On. Every digest is kept as Markdown, ready to copy into your notes or export."
              : "Off. The digest is kept as data only."
          }
          checked={settings.includeMarkdown}
          onCheckedChange={(includeMarkdown) => change({ includeMarkdown })}
        />
        {emailAvailable ? (
          <Toggle
            className="sm:col-span-2"
            label="Email me the digest"
            description={
              settings.emailEnabled
                ? "On. The digest goes from your Gmail account to your own address, and the send is recorded on the digest."
                : "Off. The digest stays in Dossier."
            }
            checked={settings.emailEnabled}
            onCheckedChange={(emailEnabled) => change({ emailEnabled })}
          />
        ) : (
          <p role="note" className="rounded-card bg-warning-surface px-4 py-3 text-meta text-warning sm:col-span-2">
            The digest can arrive by email from your own Gmail account. Connect it in{" "}
            <Link href="/settings?section=google" className="font-medium text-warning underline underline-offset-2">
              Settings → Google
            </Link>{" "}
            to turn that on.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="secondary" onClick={() => void runPreview()} disabled={previewing}>
            {previewing ? "Building…" : "Preview today's digest"}
          </Button>
          <Link href="/discovery" className="text-sm underline underline-offset-2 hover:text-ink">
            View runs
          </Link>
        </div>
        {preview !== null && <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-card bg-track p-4 text-meta">{preview}</pre>}
      </Card>

      <p className="text-meta text-muted">
        The runs the digest reports live on the Discovery screen. An emailed digest goes from your connected account to your own address; Dossier never emails an
        employer on its own.
      </p>
    </>
  );
}
