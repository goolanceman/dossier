"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action";
import type { TargetView } from "@/lib/career/targets";

import { moveTargets, removeTarget, saveTarget, setPrimaryTarget } from "./actions";

// Career directions (master.md §1.1): the roles the user is aiming at, the
// first one primary. Searches, resumes and preparation pick a target.

type FormState = {
  id: string | null;
  title: string;
  summary: string;
  seniority: string;
  salaryMin: string;
  currency: string;
  remoteCountries: string;
  priorities: string;
  keywords: string;
};

const emptyForm: FormState = {
  id: null, title: "", summary: "", seniority: "", salaryMin: "", currency: "EUR", remoteCountries: "", priorities: "", keywords: "",
};

const commaList = (value: string) => value.split(",").map((entry) => entry.trim()).filter(Boolean);
const lineList = (value: string) => value.split("\n").map((entry) => entry.trim()).filter(Boolean);

function formOf(target: TargetView): FormState {
  const { preferences } = target;
  return {
    id: target.id,
    title: target.title,
    summary: target.summary,
    seniority: preferences.seniority,
    salaryMin: preferences.salaryMin === null ? "" : String(preferences.salaryMin),
    currency: preferences.currency,
    remoteCountries: preferences.remoteCountries.join(", "),
    priorities: preferences.priorities.join("\n"),
    keywords: preferences.keywords.join(", "),
  };
}

function inputOf(form: FormState) {
  const salaryMin = Number(form.salaryMin);
  return {
    ...(form.id ? { id: form.id } : {}),
    title: form.title,
    summary: form.summary,
    seniority: form.seniority,
    // Empty means no floor; anything not a whole number reads as none.
    salaryMin: form.salaryMin.trim() === "" || !Number.isInteger(salaryMin) || salaryMin < 0 ? null : salaryMin,
    currency: form.currency,
    remoteCountries: commaList(form.remoteCountries),
    priorities: lineList(form.priorities),
    keywords: commaList(form.keywords),
  };
}

/** What a target shows under its title: seniority, pay floor, remote countries, what matters, what to match. */
function prefsLine(target: TargetView): string {
  const { preferences } = target;
  const parts = [
    preferences.seniority.trim() !== "" ? `Seniority: ${preferences.seniority}` : "",
    preferences.salaryMin !== null ? `From ${preferences.salaryMin.toLocaleString("en-US")} ${preferences.currency}` : "",
    preferences.remoteCountries.length > 0 ? `Remote in ${preferences.remoteCountries.join(", ")}` : "",
    preferences.priorities.length > 0 ? `${preferences.priorities.length} priorities` : "",
    preferences.keywords.length > 0 ? `${preferences.keywords.length} keywords` : "",
  ];
  return parts.filter((part) => part !== "").join(" · ");
}

/** The targets section (master.md §1.1): primary first, its preferences, and the form to edit them. */
export function TargetsSection({ targets }: { targets: TargetView[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<FormState | null>(null);
  const [confirming, setConfirming] = useState<TargetView | null>(null);

  /** Runs an action and refreshes the list from the server when it worked. */
  const run = async (call: Promise<ActionResult<unknown>>) => {
    if (toastResult(await call).ok) router.refresh();
  };

  const move = (id: string, delta: 1 | -1) => {
    const ids = targets.map((target) => target.id);
    const index = ids.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(moveTargets({ ids }));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-serif text-section">
          Targets <span className="text-muted">({targets.length})</span>
        </h2>
        <Button size="sm" onClick={() => setEditing(emptyForm)}>
          Add target
        </Button>
      </div>

      {editing && <TargetForm initial={editing} onDone={() => setEditing(null)} />}

      {targets.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong p-9 text-center text-sm text-muted">
          No targets yet. Add the role you are aiming at; the first one becomes your primary target.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {targets.map((target, index) => (
            <div key={target.id} className="flex flex-col gap-1 rounded-panel border border-line-card bg-card px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-[15.5px] font-medium">{target.title}</span>
                  {target.primary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-track px-2.5 py-0.5 text-meta text-primary-text" aria-label="Primary target">
                      <span aria-hidden="true">★</span> Primary
                    </span>
                  )}
                </div>
                <div className="flex flex-none items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={`Move “${target.title}” up`}
                    aria-disabled={index <= 0 || undefined}
                    onClick={() => index > 0 && move(target.id, -1)}
                    className="grid size-6 place-items-center rounded-[6px] text-sm leading-none text-muted hover:bg-hover hover:text-ink aria-disabled:cursor-default aria-disabled:text-faint aria-disabled:hover:bg-transparent"
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Move “${target.title}” down`}
                    aria-disabled={index >= targets.length - 1 || undefined}
                    onClick={() => index < targets.length - 1 && move(target.id, 1)}
                    className="grid size-6 place-items-center rounded-[6px] text-sm leading-none text-muted hover:bg-hover hover:text-ink aria-disabled:cursor-default aria-disabled:text-faint aria-disabled:hover:bg-transparent"
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </div>
              </div>
              {target.summary.trim() !== "" && <p className="text-control text-muted">{target.summary}</p>}
              {prefsLine(target) !== "" && <p className="text-meta text-muted">{prefsLine(target)}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!target.primary && (
                  <Button variant="secondary" size="sm" className="bg-input" onClick={() => run(setPrimaryTarget({ id: target.id }))}>
                    Make primary
                  </Button>
                )}
                <Button variant="text" size="sm" onClick={() => setEditing(formOf(target))}>
                  Edit
                </Button>
                <Button variant="danger-text" size="sm" onClick={() => setConfirming(target)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Delete target?"
        description={confirming ? `Deletes “${confirming.title}” for good. Searches and documents keep working; they just aim at your other targets.` : ""}
        confirmLabel="Delete target"
        onConfirm={() => {
          if (confirming) void run(removeTarget({ id: confirming.id }));
          setConfirming(null);
        }}
      />
    </div>
  );
}

/** The target's create/edit form: the role, and the preferences discovery and scoring read. */
function TargetForm({ initial, onDone }: { initial: FormState; onDone: () => void }) {
  const [form, setForm] = useState(initial);
  const set = (change: Partial<FormState>) => setForm((current) => ({ ...current, ...change }));

  const save = async () => {
    if (toastResult(await saveTarget(inputOf(form))).ok) onDone();
  };

  return (
    <div className="grid grid-cols-2 gap-[18px] rounded-panel border bg-card p-7">
      <h3 className="col-span-2 font-serif text-section">{form.id ? "Edit target" : "New target"}</h3>
      <Input className="col-span-2" label="Title" placeholder="Staff Backend Engineer" value={form.title} onChange={(event) => set({ title: event.target.value })} autoFocus />
      <Textarea className="col-span-2" label="What you want from it" rows={2} value={form.summary} onChange={(event) => set({ summary: event.target.value })} />
      <Input label="Seniority" placeholder="Senior, Staff, Lead" value={form.seniority} onChange={(event) => set({ seniority: event.target.value })} />
      <div className="flex items-end gap-2">
        <Input
          className="w-full"
          label="Minimum salary"
          inputMode="numeric"
          placeholder="90000"
          value={form.salaryMin}
          onChange={(event) => set({ salaryMin: event.target.value.replace(/[^\d]/g, "") })}
        />
        <Input className="w-24" label="Currency" placeholder="EUR" value={form.currency} onChange={(event) => set({ currency: event.target.value })} />
      </div>
      <Input
        className="col-span-2"
        label="Remote countries"
        hint="Comma separated, e.g. Germany, Netherlands."
        value={form.remoteCountries}
        onChange={(event) => set({ remoteCountries: event.target.value })}
      />
      <Textarea className="col-span-2" label="Priorities" rows={2} hint="What matters in this role, one per line." value={form.priorities} onChange={(event) => set({ priorities: event.target.value })} />
      <Input
        className="col-span-2"
        label="Keywords"
        hint="Comma separated. Achievements in your library must mention one of these to match this target."
        value={form.keywords}
        onChange={(event) => set({ keywords: event.target.value })}
      />
      <div className="col-span-2 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" className="bg-input" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={save}>
          Save target
        </Button>
      </div>
    </div>
  );
}
