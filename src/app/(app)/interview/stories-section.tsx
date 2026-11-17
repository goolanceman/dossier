"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { StarStoryView } from "@/lib/interview/plans";

import { removeStarStory, saveStarStory } from "./actions";

// The STAR story bank (master.md §7.4): reusable answers to behavioural
// questions, told as situation, task, action and result. A story may name the
// achievement it is based on, so the bank and the evidence library stay one
// body of truth rather than two.

/** Comma-separated input to a string list, as the chips are typed. */
const listOf = (text: string) => text.split(",").map((entry) => entry.trim()).filter(Boolean).slice(0, 20);

type StoryFormState = {
  id: string | null;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  technologies: string;
  businessImpact: string;
  skills: string;
  achievementId: string;
};

const emptyForm: StoryFormState = {
  id: null,
  title: "",
  situation: "",
  task: "",
  action: "",
  result: "",
  technologies: "",
  businessImpact: "",
  skills: "",
  achievementId: "",
};

const fromStory = (story: StarStoryView): StoryFormState => ({
  id: story.id,
  title: story.title,
  situation: story.situation,
  task: story.task,
  action: story.action,
  result: story.result,
  technologies: story.technologies.join(", "),
  businessImpact: story.businessImpact,
  skills: story.skills.join(", "),
  achievementId: story.achievementId ?? "",
});

function StoryForm({ initial, achievements, onDone }: { initial: StoryFormState; achievements: { id: string; title: string }[]; onDone: () => void }) {
  const [form, setForm] = useState(initial);
  const set = (change: Partial<StoryFormState>) => setForm((current) => ({ ...current, ...change }));

  const save = async () => {
    const result = await saveStarStory({
      id: form.id ?? undefined,
      title: form.title,
      situation: form.situation,
      task: form.task,
      action: form.action,
      result: form.result,
      technologies: listOf(form.technologies),
      businessImpact: form.businessImpact,
      skills: listOf(form.skills),
      achievementId: form.achievementId === "" ? null : form.achievementId,
      questionIds: [],
    });
    if (toastResult(result).ok) onDone();
  };

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <h3 className="font-serif text-section">{form.id === null ? "New STAR story" : "Edit STAR story"}</h3>
        <Input label="Title" placeholder="The Kafka migration" value={form.title} onChange={(event) => set({ title: event.target.value })} />
        <Textarea label="Situation" value={form.situation} onChange={(event) => set({ situation: event.target.value })} rows={3} />
        <Textarea label="Task" value={form.task} onChange={(event) => set({ task: event.target.value })} rows={2} />
        <Textarea label="Action" value={form.action} onChange={(event) => set({ action: event.target.value })} rows={3} />
        <Textarea label="Result" value={form.result} onChange={(event) => set({ result: event.target.value })} rows={2} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Technologies" hint="Comma separated" value={form.technologies} onChange={(event) => set({ technologies: event.target.value })} />
          <Input label="Skills shown" hint="Comma separated" value={form.skills} onChange={(event) => set({ skills: event.target.value })} />
        </div>
        <Textarea label="Business impact" value={form.businessImpact} onChange={(event) => set({ businessImpact: event.target.value })} rows={2} />
        <Select label="Based on achievement (optional)" value={form.achievementId} onChange={(event) => set({ achievementId: event.target.value })}>
          <option value="">None</option>
          {achievements.map((achievement) => (
            <option key={achievement.id} value={achievement.id}>
              {achievement.title === "" ? "Untitled achievement" : achievement.title}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button onClick={save} aria-disabled={form.title.trim() === "" || undefined}>
            Save story
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StoryCard({ story, achievements, onEdit }: { story: StarStoryView; achievements: { id: string; title: string }[]; onEdit: () => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    const result = await removeStarStory({ id: story.id });
    if (toastResult(result).ok) router.refresh();
  };

  const achievement = story.achievementId === null ? undefined : achievements.find(({ id }) => id === story.achievementId);
  const star: [string, string][] = [
    ["Situation", story.situation],
    ["Task", story.task],
    ["Action", story.action],
    ["Result", story.result],
  ];

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium">{story.title}</p>
          {(story.technologies.length > 0 || story.skills.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {[...story.technologies, ...story.skills].map((entry) => (
                <span key={entry} className="rounded-full border border-line-field bg-input px-2 py-0.5 text-meta">
                  {entry}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="text" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="danger-text" size="sm" onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </div>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        {star.map(([label, value]) =>
          value.trim() === "" ? null : (
            <div key={label}>
              <dt className="text-meta font-medium">{label}</dt>
              <dd className="text-sm text-muted">{value}</dd>
            </div>
          ),
        )}
      </dl>
      {story.businessImpact.trim() !== "" && <p className="text-sm text-muted">Business impact: {story.businessImpact}</p>}
      {achievement !== undefined && <p className="text-meta text-muted">Based on: {achievement.title === "" ? "Untitled achievement" : achievement.title}</p>}
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete this story?" description="It is removed for good." confirmLabel="Delete story" onConfirm={remove} />
    </Card>
  );
}

/** The STAR bank: the list, the form, and nothing that pretends to grade them. */
export function StoriesSection({ stories, achievements }: { stories: StarStoryView[]; achievements: { id: string; title: string }[] }) {
  const [editing, setEditing] = useState<StoryFormState | null>(null);

  return (
    <section id="star-stories" aria-labelledby="stories-heading" className="flex flex-col gap-3 scroll-mt-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="stories-heading" className="font-serif text-section">
          STAR story bank
        </h2>
        {editing === null && (
          <Button size="sm" onClick={() => setEditing(emptyForm)}>
            Add story
          </Button>
        )}
      </div>
      {editing !== null ? (
        <StoryForm initial={editing} achievements={achievements} onDone={() => setEditing(null)} />
      ) : stories.length === 0 ? (
        <p className="text-sm text-muted">No STAR stories yet. Write the situations, actions and results you want to tell again in interviews.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} achievements={achievements} onEdit={() => setEditing(fromStory(story))} />
          ))}
        </div>
      )}
    </section>
  );
}
