"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EvidenceStatus } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action";
import type { AchievementInput, AchievementView, AchievementVersion } from "@/lib/career/achievements";
import { cn } from "@/lib/cn";

import { moveAchievements, removeAchievement, saveAchievement, setAchievementStatus, verifyAchievement } from "./actions";
import { EvidenceBadge } from "./status-badge";

// The evidence library (master.md §1.2): one card per achievement, the
// status pill honest about what's checked (IMPORTED is never "verified"),
// and the statuses only the user may set behind their own buttons.

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: EvidenceStatus.VERIFIED, label: "Verified" },
  { value: EvidenceStatus.USER_CONFIRMED, label: "Confirmed" },
  { value: EvidenceStatus.IMPORTED, label: "Imported" },
  { value: EvidenceStatus.NEEDS_CLARIFICATION, label: "Needs clarification" },
  { value: EvidenceStatus.REJECTED, label: "Rejected" },
] as const;

const VERSION_KINDS: Record<AchievementVersion["kind"], string> = {
  TECHNICAL: "Technical",
  BUSINESS: "Business",
  LEADERSHIP: "Leadership",
  ATS: "ATS",
  PROJECT: "Project",
  OTHER: "Other",
};

type FormState = {
  id: string | null;
  title: string;
  description: string;
  detail: string;
  company: string;
  position: string;
  project: string;
  technologies: string;
  problem: string;
  action: string;
  outcome: string;
  businessImpact: string;
  metrics: string;
  scale: string;
  ownership: string;
  complexity: string;
  evidenceUrl: string;
  evidenceNotes: string;
  tags: string;
  skills: string;
  versions: AchievementVersion[];
};

const emptyForm: FormState = {
  id: null, title: "", description: "", detail: "", company: "", position: "", project: "", technologies: "",
  problem: "", action: "", outcome: "", businessImpact: "", metrics: "", scale: "", ownership: "", complexity: "",
  evidenceUrl: "", evidenceNotes: "", tags: "", skills: "", versions: [],
};

const commaList = (value: string) => value.split(",").map((entry) => entry.trim()).filter(Boolean);
const lineList = (value: string) => value.split("\n").map((entry) => entry.trim()).filter(Boolean);

function formOf(achievement: AchievementView): FormState {
  return {
    ...emptyForm,
    id: achievement.id,
    title: achievement.title,
    description: achievement.description,
    detail: achievement.detail,
    company: achievement.company,
    position: achievement.position,
    project: achievement.project,
    technologies: achievement.technologies.join(", "),
    problem: achievement.problem,
    action: achievement.action,
    outcome: achievement.outcome,
    businessImpact: achievement.businessImpact,
    metrics: achievement.metrics.join("\n"),
    scale: achievement.scale,
    ownership: achievement.ownership,
    complexity: achievement.complexity,
    evidenceUrl: achievement.evidenceUrl,
    evidenceNotes: achievement.evidenceNotes,
    tags: achievement.tags.join(", "),
    skills: achievement.skills.join(", "),
    versions: achievement.versions.map((version) => ({ ...version })),
  };
}

function inputOf(form: FormState): AchievementInput & { id?: string } {
  return {
    ...(form.id ? { id: form.id } : {}),
    title: form.title,
    description: form.description,
    detail: form.detail,
    company: form.company,
    position: form.position,
    project: form.project,
    technologies: commaList(form.technologies),
    problem: form.problem,
    action: form.action,
    outcome: form.outcome,
    businessImpact: form.businessImpact,
    metrics: lineList(form.metrics),
    scale: form.scale,
    ownership: form.ownership,
    complexity: form.complexity,
    evidenceUrl: form.evidenceUrl,
    evidenceNotes: form.evidenceNotes,
    tags: commaList(form.tags),
    skills: commaList(form.skills),
    versions: form.versions.filter((version) => version.text.trim() !== ""),
  };
}

/** One labelled line of the expanded detail; hidden when the field is empty. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-label text-muted">{label}</span>
      <div className="text-control text-ink">{children}</div>
    </div>
  );
}

/** ↑ or ↓, staying focusable at the ends (aria-disabled), like the profile's Move buttons. */
function MoveButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onClick()}
      className="grid size-6 place-items-center rounded-[6px] text-sm leading-none text-muted hover:bg-hover hover:text-ink aria-disabled:cursor-default aria-disabled:text-faint aria-disabled:hover:bg-transparent"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

/** The achievement's create/edit form, all fields at once. */
function AchievementForm({ initial, onDone }: { initial: FormState; onDone: () => void }) {
  const [form, setForm] = useState(initial);
  const set = (change: Partial<FormState>) => setForm((current) => ({ ...current, ...change }));
  const setVersion = (index: number, change: Partial<AchievementVersion>) =>
    setForm((current) => ({ ...current, versions: current.versions.map((version, at) => (at === index ? { ...version, ...change } : version)) }));

  const save = async () => {
    if (toastResult(await saveAchievement(inputOf(form))).ok) onDone();
  };

  return (
    <div className="grid grid-cols-2 gap-[18px] rounded-panel border bg-card p-7">
      <h3 className="col-span-2 font-serif text-section">{form.id ? "Edit achievement" : "New achievement"}</h3>
      <Input className="col-span-2" label="Title" placeholder="Cut checkout p99 latency by 40%" value={form.title} onChange={(event) => set({ title: event.target.value })} autoFocus />
      <Textarea className="col-span-2" label="What you did" rows={2} value={form.description} onChange={(event) => set({ description: event.target.value })} />
      <Textarea className="col-span-2" label="The fuller story" rows={3} hint="Problem, action, outcome, in your own words." value={form.detail} onChange={(event) => set({ detail: event.target.value })} />
      <Input label="Company" value={form.company} onChange={(event) => set({ company: event.target.value })} />
      <Input label="Position" value={form.position} onChange={(event) => set({ position: event.target.value })} />
      <Input className="col-span-2" label="Project" value={form.project} onChange={(event) => set({ project: event.target.value })} />
      <Input
        className="col-span-2"
        label="Technologies"
        hint="Comma separated, e.g. Postgres, Kafka, React."
        value={form.technologies}
        onChange={(event) => set({ technologies: event.target.value })}
      />
      <Input label="Problem" value={form.problem} onChange={(event) => set({ problem: event.target.value })} />
      <Input label="Action" value={form.action} onChange={(event) => set({ action: event.target.value })} />
      <Input label="Outcome" value={form.outcome} onChange={(event) => set({ outcome: event.target.value })} />
      <Input label="Business impact" value={form.businessImpact} onChange={(event) => set({ businessImpact: event.target.value })} />
      <Textarea
        className="col-span-2"
        label="Metrics"
        rows={2}
        hint="One per line, as you can back them, e.g. p99 latency 40% lower (dashboards)."
        value={form.metrics}
        onChange={(event) => set({ metrics: event.target.value })}
      />
      <Input label="Scale" placeholder="10 engineers, 2M requests/day" value={form.scale} onChange={(event) => set({ scale: event.target.value })} />
      <Input label="Ownership" placeholder="led, co-built, contributed" value={form.ownership} onChange={(event) => set({ ownership: event.target.value })} />
      <Input label="Complexity" placeholder="Greenfield, Migration, Scaling" value={form.complexity} onChange={(event) => set({ complexity: event.target.value })} />
      <Input label="Evidence link" placeholder="https://…" value={form.evidenceUrl} onChange={(event) => set({ evidenceUrl: event.target.value })} />
      <Textarea className="col-span-2" label="Evidence notes" rows={2} value={form.evidenceNotes} onChange={(event) => set({ evidenceNotes: event.target.value })} />
      <Input label="Tags" hint="Comma separated." value={form.tags} onChange={(event) => set({ tags: event.target.value })} />
      <Input label="Skills" hint="Comma separated, by name." value={form.skills} onChange={(event) => set({ skills: event.target.value })} />

      <div className="col-span-2 flex flex-col gap-2">
        <span className="text-label text-muted">Other phrasings</span>
        {form.versions.map((version, index) => (
          <div key={index} className="flex items-start gap-2">
            <Select aria-label="Phrasing kind" value={version.kind} onChange={(event) => setVersion(index, { kind: event.target.value as AchievementVersion["kind"] })}>
              {Object.entries(VERSION_KINDS).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </Select>
            <Textarea aria-label="Phrasing" rows={1} value={version.text} onChange={(event) => setVersion(index, { text: event.target.value })} />
            <Button variant="text" size="sm" onClick={() => set({ versions: form.versions.filter((_, at) => at !== index) })}>
              Remove
            </Button>
          </div>
        ))}
        <div>
          <Button variant="secondary" size="sm" onClick={() => set({ versions: [...form.versions, { kind: "TECHNICAL", text: "" }] })}>
            Add a phrasing
          </Button>
        </div>
      </div>

      <div className="col-span-2 flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" className="bg-input" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={save}>
          Save achievement
        </Button>
      </div>
    </div>
  );
}

/** The achievements section (master.md §1.2): filter, search, expandable rows, statuses and reorder. */
export function AchievementsSection({ achievements }: { achievements: AchievementView[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("ALL");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [confirming, setConfirming] = useState<AchievementView | null>(null);
  const bodyId = useId();

  const shown = useMemo(() => {
    const search = query.trim().toLowerCase();
    return achievements.filter(
      (achievement) =>
        (filter === "ALL" || achievement.status === filter) &&
        (search === "" ||
          [achievement.title, achievement.description, achievement.tags.join(" ")].join(" ").toLowerCase().includes(search)),
    );
  }, [achievements, filter, query]);
  // Reordering only in the plain list: arrows would jump over hidden entries otherwise.
  const reorderable = filter === "ALL" && query.trim() === "";

  /** Runs an action and refreshes the list from the server when it worked. */
  const run = async (call: Promise<ActionResult<unknown>>) => {
    if (toastResult(await call).ok) router.refresh();
  };

  const move = (id: string, delta: 1 | -1) => {
    const ids = achievements.map((achievement) => achievement.id);
    const index = ids.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(moveAchievements({ ids }));
  };

  const title = (achievement: AchievementView) => achievement.title.trim() || "Untitled achievement";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-serif text-section">
          Achievements <span className="text-muted">({achievements.length})</span>
        </h2>
        <Button size="sm" onClick={() => setEditing(emptyForm)}>
          Add achievement
        </Button>
      </div>

      {editing && <AchievementForm initial={editing} onDone={() => setEditing(null)} />}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((entry) => (
          <ToggleChip key={entry.value} selected={filter === entry.value} onClick={() => setFilter(entry.value)}>
            {entry.label}
          </ToggleChip>
        ))}
        <Input
          className="ml-auto max-w-[260px]"
          aria-label="Search achievements"
          placeholder="Search title, description or tags"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {achievements.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong p-9 text-center text-sm text-muted">
          No achievements yet. Add the work you can prove: what you did, what changed, and the numbers that back it.
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong p-9 text-center text-sm text-muted">
          {query.trim() === "" ? "No achievements with this status." : "Nothing matches your search."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((achievement) => {
            const index = achievements.findIndex((entry) => entry.id === achievement.id);
            const open = openId === achievement.id;
            const subtitle = [achievement.company, achievement.position, achievement.project].filter((part) => part.trim()).join(" · ");
            const hasStory = [achievement.description, achievement.detail, achievement.problem, achievement.action, achievement.outcome, achievement.businessImpact]
              .some((field) => field.trim() !== "") || achievement.metrics.length > 0;
            return (
              <div key={achievement.id} className={cn("overflow-hidden rounded-panel border bg-card", open ? "border-ink/30" : "border-line-card")}>
                <div className="flex">
                  {reorderable && (
                    <span className="flex flex-none flex-col justify-center gap-0.5 pl-3">
                      <MoveButton label={`Move “${title(achievement)}” up`} disabled={index <= 0} onClick={() => move(achievement.id, -1)}>
                        ↑
                      </MoveButton>
                      <MoveButton label={`Move “${title(achievement)}” down`} disabled={index >= achievements.length - 1} onClick={() => move(achievement.id, 1)}>
                        ↓
                      </MoveButton>
                    </span>
                  )}
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => setOpenId(open ? null : achievement.id)}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-start gap-1 py-5 pr-6 text-left focus-visible:-outline-offset-2",
                      reorderable ? "pl-3" : "pl-6",
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15.5px] font-medium">{title(achievement)}</span>
                      <EvidenceBadge status={achievement.status} />
                    </span>
                    {subtitle !== "" && <span className="text-control text-muted">{subtitle}</span>}
                    {achievement.technologies.length > 0 && (
                      <span className="flex flex-wrap gap-1.5">
                        {achievement.technologies.map((tech) => (
                          <span key={tech} className="rounded-full bg-track px-2 py-0.5 text-meta text-muted">
                            {tech}
                          </span>
                        ))}
                      </span>
                    )}
                    {achievement.metrics.length > 0 && (
                      <span className="text-control font-medium text-ink">
                        {achievement.metrics[0]}
                        {achievement.metrics.length > 1 && <span className="font-normal text-muted"> +{achievement.metrics.length - 1} more</span>}
                      </span>
                    )}
                  </button>
                </div>
                {open && (
                  <div id={bodyId} className="flex flex-col gap-5 border-t border-line px-6 pt-[22px] pb-6">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                      {achievement.description.trim() !== "" && <div className="col-span-2"><Detail label="What you did">{achievement.description}</Detail></div>}
                      {achievement.detail.trim() !== "" && <div className="col-span-2"><Detail label="The fuller story">{achievement.detail}</Detail></div>}
                      {achievement.problem.trim() !== "" && <Detail label="Problem">{achievement.problem}</Detail>}
                      {achievement.action.trim() !== "" && <Detail label="Action">{achievement.action}</Detail>}
                      {achievement.outcome.trim() !== "" && <Detail label="Outcome">{achievement.outcome}</Detail>}
                      {achievement.businessImpact.trim() !== "" && <Detail label="Business impact">{achievement.businessImpact}</Detail>}
                      {achievement.metrics.length > 0 && <div className="col-span-2"><Detail label="Metrics"><span className="whitespace-pre-line">{achievement.metrics.join("\n")}</span></Detail></div>}
                      {achievement.scale.trim() !== "" && <Detail label="Scale">{achievement.scale}</Detail>}
                      {achievement.ownership.trim() !== "" && <Detail label="Ownership">{achievement.ownership}</Detail>}
                      {achievement.complexity.trim() !== "" && <Detail label="Complexity">{achievement.complexity}</Detail>}
                      {achievement.evidenceUrl.trim() !== "" && (
                        <div className="col-span-2">
                          <Detail label="Evidence">
                            <a href={achievement.evidenceUrl} className="underline underline-offset-3" target="_blank" rel="noreferrer">
                              {achievement.evidenceUrl}
                            </a>
                          </Detail>
                        </div>
                      )}
                      {achievement.evidenceNotes.trim() !== "" && <div className="col-span-2"><Detail label="Evidence notes">{achievement.evidenceNotes}</Detail></div>}
                      {achievement.tags.length > 0 && <Detail label="Tags">{achievement.tags.join(", ")}</Detail>}
                      {achievement.skills.length > 0 && <Detail label="Skills">{achievement.skills.join(", ")}</Detail>}
                      {achievement.versions.length > 0 && (
                        <div className="col-span-2 flex flex-col gap-1.5">
                          <span className="text-label text-muted">Other phrasings</span>
                          {achievement.versions.map((version, at) => (
                            <p key={at} className="text-control text-ink">
                              <span className="text-muted">{VERSION_KINDS[version.kind]}: </span>
                              {version.text}
                            </p>
                          ))}
                        </div>
                      )}
                      {!hasStory && <p className="col-span-2 text-control text-muted">Nothing filled in yet.</p>}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button variant="danger-text" size="sm" onClick={() => setConfirming(achievement)}>
                        Remove
                      </Button>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="text" size="sm" onClick={() => setEditing(formOf(achievement))}>
                          Edit
                        </Button>
                        {/* The user checks the source; the AI may never set these (master.md §13). */}
                        {achievement.status !== EvidenceStatus.VERIFIED && (
                          <Button variant="secondary" size="sm" className="bg-input" onClick={() => run(verifyAchievement({ id: achievement.id }))}>
                            Mark verified
                          </Button>
                        )}
                        {achievement.status !== EvidenceStatus.NEEDS_CLARIFICATION && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="bg-input"
                            onClick={() => run(setAchievementStatus({ id: achievement.id, status: EvidenceStatus.NEEDS_CLARIFICATION }))}
                          >
                            Needs clarification
                          </Button>
                        )}
                        {achievement.status !== EvidenceStatus.REJECTED && (
                          <Button variant="secondary" size="sm" className="bg-input" onClick={() => run(setAchievementStatus({ id: achievement.id, status: EvidenceStatus.REJECTED }))}>
                            Reject
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Delete achievement?"
        description={
          confirming ? `Deletes “${title(confirming)}” for good. Documents it came from keep their other findings.` : ""
        }
        confirmLabel="Delete achievement"
        onConfirm={() => {
          if (confirming) void run(removeAchievement({ id: confirming.id }));
          setConfirming(null);
        }}
      />
    </div>
  );
}
