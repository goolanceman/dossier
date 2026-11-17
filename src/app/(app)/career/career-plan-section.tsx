"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast, toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { useJob } from "@/hooks/use-job";
import type { ActionResult } from "@/lib/action";
import { planSummary, type PlanGoal } from "@/lib/career/plan-items";
import type { CareerPlanView } from "@/lib/career/plan";
import type { TargetView } from "@/lib/career/targets";

import { generateCareerPlan, removePlan, toggleAction } from "./actions";
import type { GenerateCareerPlanResult } from "./jobs";

// The career plan (master.md Phase 5 extension): goals for now, next and
// later, drawn by the AI from the profile, the base resume or the latest
// critique. The plan proposes; the user works it, checking actions off as
// they are done.

const BASED_ON_LABELS: Record<CareerPlanView["basedOn"], string> = {
  PROFILE: "From profile",
  RESUME: "From resume",
  ASSESSMENT: "From critique",
};

/** The horizons in the order the detail groups them, with the summary key and the word shown. */
const HORIZONS: { horizon: PlanGoal["horizon"]; label: string; key: "now" | "next" | "later" }[] = [
  { horizon: "NOW", label: "Now", key: "now" },
  { horizon: "NEXT", label: "Next", key: "next" },
  { horizon: "LATER", label: "Later", key: "later" },
];

const EFFORT_LABELS: Record<PlanGoal["actions"][number]["effort"], string> = {
  LIGHT: "light effort",
  MEDIUM: "medium effort",
  HEAVY: "heavy effort",
};

/** The generate form: what the plan is based on, and the target it aims at, if any. */
function GenerateForm({
  targets,
  hasResume,
  onStart,
  onDone,
}: {
  targets: TargetView[];
  hasResume: boolean;
  onStart: (jobId: string) => void;
  onDone: () => void;
}) {
  const [basedOn, setBasedOn] = useState<"PROFILE" | "RESUME">("PROFILE");
  const [targetId, setTargetId] = useState("");

  const start = async () => {
    const result = toastResult(await generateCareerPlan({ basedOn, ...(targetId ? { targetId } : {}) }));
    if (result.ok) {
      onStart(result.data.jobId);
      onDone();
    }
  };

  return (
    <div className="flex flex-col gap-[18px] rounded-panel border bg-card p-7">
      <h3 className="font-serif text-section">Generate a plan</h3>
      <div className="flex flex-col gap-2">
        <p className="text-label font-medium">Based on</p>
        <SegmentedControl
          aria-label="Base the plan on"
          size="sm"
          options={[
            { value: "PROFILE", label: "Profile" },
            { value: "RESUME", label: "Resume" },
          ]}
          value={basedOn}
          onValueChange={(value) => setBasedOn(value as "PROFILE" | "RESUME")}
        />
        {basedOn === "RESUME" && !hasResume && (
          <p className="text-label text-muted">
            There is no resume yet: add experience or projects to your profile first, or base the plan on your profile.
          </p>
        )}
      </div>
      <Select label="Aim at" hint="Optional. The plan reads what matters in the target." value={targetId} onChange={(event) => setTargetId(event.target.value)}>
        <option value="">No target in particular</option>
        {targets.map((target) => (
          <option key={target.id} value={target.id}>
            {target.title}
          </option>
        ))}
      </Select>
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" className="bg-input" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" disabled={basedOn === "RESUME" && !hasResume} onClick={start}>
          Generate plan
        </Button>
      </div>
    </div>
  );
}

/** One goal: why it matters, its actions to check off, and its milestones. */
function Goal({ goal, checked, onToggle }: { goal: PlanGoal; checked: (actionId: string, stored?: boolean) => boolean; onToggle: (actionId: string, done: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-control font-medium">{goal.title}</p>
      {goal.why.trim() !== "" && <p className="text-control text-muted">{goal.why}</p>}
      {goal.actions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {goal.actions.map((action) => (
            <Checkbox
              key={action.id}
              label={
                <>
                  {action.action}
                  <span className="ml-2 text-meta text-muted">{EFFORT_LABELS[action.effort]}</span>
                </>
              }
              checked={checked(action.id, action.done)}
              onChange={(event) => onToggle(action.id, event.target.checked)}
            />
          ))}
        </div>
      )}
      {goal.milestones.length > 0 && (
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-control text-muted">
          {goal.milestones.map((milestone, index) => (
            <li key={index}>{milestone}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The plan's detail: goals grouped by horizon, then the risks the AI flagged. */
function PlanDetail({
  plan,
  checked,
  onToggle,
}: {
  plan: CareerPlanView;
  checked: (actionId: string, stored?: boolean) => boolean;
  onToggle: (actionId: string, done: boolean) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-5 border-t border-line pt-4">
      {plan.items.goals.length === 0 && <p className="text-control text-muted">This plan has no goals in it.</p>}
      {HORIZONS.map(({ horizon, label }) => {
        const goals = plan.items.goals.filter((goal) => goal.horizon === horizon);
        if (goals.length === 0) return null;
        return (
          <div key={horizon} className="flex flex-col gap-4">
            <h4 className="text-meta font-medium tracking-wide text-muted uppercase">{label}</h4>
            {goals.map((goal) => (
              <Goal key={goal.id} goal={goal} checked={checked} onToggle={onToggle} />
            ))}
          </div>
        );
      })}
      {plan.items.risks.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-meta font-medium tracking-wide text-muted uppercase">Risks</h4>
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-control text-muted">
            {plan.items.risks.map((risk, index) => (
              <li key={index}>{risk}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The career-plan section (master.md Phase 5 extension): the plans, and the form that generates one. */
export function CareerPlanSection({
  plans,
  targets,
  aiReady,
  hasResume,
}: {
  plans: CareerPlanView[];
  targets: TargetView[];
  aiReady: boolean;
  hasResume: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<CareerPlanView | null>(null);
  // The user's checked actions are kept here until the server confirms, so
  // the checkbox moves at once even while the action is on its way.
  const [checkedFlags, setCheckedFlags] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState<{ jobId: string } | null>(null);

  // The job's updates come from outside (SSE or polling), so the follow-up goes in its callback: the toast, the refresh, and clearing the line.
  const job = useJob<GenerateCareerPlanResult>(generating?.jobId ?? null, 0, (update) => {
    if (update.status === "DONE") {
      toast("Plan generated. Check its actions off as you do them.");
      setGenerating(null);
      router.refresh();
    } else if (update.status === "FAILED") {
      toast(update.error ?? "The plan didn't generate. Try again.");
      setGenerating(null);
    }
  });

  const run = async (call: Promise<ActionResult<unknown>>) => {
    if (toastResult(await call).ok) router.refresh();
  };

  const checked = (planId: string) => (actionId: string, stored?: boolean) => checkedFlags[`${planId}:${actionId}`] ?? Boolean(stored);

  const toggle = (planId: string, actionId: string, done: boolean) => {
    const key = `${planId}:${actionId}`;
    setCheckedFlags((current) => ({ ...current, [key]: done }));
    void (async () => {
      const result = await toggleAction({ planId, actionId, done });
      if (!result.ok) {
        toast(result.error);
        // The checkbox goes back to what the server has.
        setCheckedFlags((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        return;
      }
      router.refresh();
    })();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-serif text-section">
          Career plan <span className="text-muted">({plans.length})</span>
        </h2>
        {aiReady && (
          <Button size="sm" onClick={() => setAdding(true)}>
            Generate a plan
          </Button>
        )}
      </div>

      {!aiReady && (
        <p className="rounded-card bg-track px-4 py-3 text-meta text-muted">
          To generate a plan, connect an AI provider in{" "}
          <Link href="/settings?section=ai" className="underline underline-offset-3">
            Settings
          </Link>
          . You can keep plans and check actions off already.
        </p>
      )}

      {generating && (
        <p role="status" className="text-meta text-muted">
          Planning your career goals: {job?.step ?? "starting"}… This can take a little longer on a local model.
        </p>
      )}

      {adding && <GenerateForm targets={targets} hasResume={hasResume} onStart={(jobId) => setGenerating({ jobId })} onDone={() => setAdding(false)} />}

      {plans.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line-strong p-9 text-center text-sm text-muted">
          No plans yet. Generate one from your profile or your resume; it lists goals for now, next and later, with the actions to get there.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map((plan) => {
            const open = openId === plan.id;
            const summary = planSummary(plan);
            const title = plan.headline.trim() !== "" ? plan.headline : "Career plan";
            return (
              <div key={plan.id} className="flex flex-col gap-1 rounded-panel border border-line-card bg-card px-6 py-5">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : plan.id)}
                  className="flex flex-col items-start gap-1 text-left focus-visible:-outline-offset-2"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15.5px] font-medium">{title}</span>
                    <span className="inline-flex w-fit items-center rounded-full bg-track px-2.5 py-0.5 text-meta text-muted">{BASED_ON_LABELS[plan.basedOn]}</span>
                    {plan.target && <span className="text-meta text-muted">Aim: {plan.target.title}</span>}
                  </span>
                  <span className="text-meta text-muted">
                    {HORIZONS.filter(({ key }) => summary[key] > 0)
                      .map(({ key, label }) => `${summary[key]} ${label.toLowerCase()}`)
                      .join(" · ")}
                    {summary.actionsTotal > 0 && ` · ${summary.actionsDone} of ${summary.actionsTotal} actions done`}
                    {summary.actionsTotal === 0 && "No actions yet"}
                  </span>
                </button>
                {open && (
                  <div className="flex flex-col gap-4">
                    <PlanDetail plan={plan} checked={checked(plan.id)} onToggle={(actionId, done) => toggle(plan.id, actionId, done)} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="danger-text" size="sm" onClick={() => setConfirming(plan)}>
                        Remove
                      </Button>
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
        title="Delete plan?"
        description={
          confirming
            ? `Deletes “${confirming.headline.trim() !== "" ? confirming.headline : "this plan"}” for good. The achievements behind its actions stay in your library.`
            : ""
        }
        confirmLabel="Delete plan"
        onConfirm={() => {
          if (confirming) void run(removePlan({ id: confirming.id }));
          setConfirming(null);
        }}
      />
    </div>
  );
}
