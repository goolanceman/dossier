"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toast, toastResult } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import type { ExternalSourceView } from "@/lib/discovery/external";

import { deleteExternalSource, saveExternalSource } from "./actions";

// The external sources (master.md §2.1): the user's own scraper over HTTP,
// or an Apify actor, saved as Setting rows. A profile's External source
// select lists them. Tokens stay server-side: they're written to the row,
// never read back, and the form shows "Saved" in their place.

type EditorState = { source: ExternalSourceView | null } | null;

/** The kind as the form words it. */
const KIND_LABELS: Record<ExternalSourceView["kind"], string> = {
  HTTP_SCRAPER: "HTTP scraper",
  APIFY: "Apify actor",
};

/**
 * The saved sources, and the form to add or edit one. The form is valid
 * like the action validates it: a public web address for a scraper, an
 * actor id and a token for Apify.
 */
export function ExternalSourcesSection({ sources }: { sources: ExternalSourceView[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditorState>(null);
  const [deleting, setDeleting] = useState<ExternalSourceView | null>(null);

  return (
    <section aria-labelledby="discovery-sources" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="discovery-sources" className="font-serif text-section">
          External sources
        </h2>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing({ source: null })}>
            Add source
          </Button>
        )}
      </div>

      {editing ? (
        <SourceEditor
          initial={editing.source}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : sources.length === 0 ? (
        <p className="rounded-card border border-line-card bg-card px-5 py-4 text-sm text-muted">
          No external sources yet. The built-in job sources need none; add your own scraper or an Apify actor and a profile can search it instead.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sources.map((source) => (
            <li key={source.id}>
              <Card padding="none" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm font-medium">{source.label}</p>
                  <p className="text-meta text-muted">
                    {KIND_LABELS[source.kind]}
                    {source.kind === "HTTP_SCRAPER" && source.url ? ` · ${new URL(source.url).host}` : ""}
                    {source.kind === "APIFY" && source.hasActor ? ` · ${source.id}` : ""}
                    {source.hasToken ? " · token saved" : ""}
                  </p>
                </div>
                <p className="ml-auto text-meta text-muted">{source.enabled ? "On" : "Off"}</p>
                <Button size="sm" variant="secondary" onClick={() => setEditing({ source })}>
                  Edit
                </Button>
                <Button size="sm" variant="danger-text" onClick={() => setDeleting(source)}>
                  Remove
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove this source?"
        description="Profiles that search it fail their runs until they name another. The saved token goes with it."
        confirmLabel="Remove source"
        onConfirm={() => {
          if (deleting) void deleteExternalSource({ id: deleting.id }).then((result) => {
            if (toastResult(result).ok) router.refresh();
          });
          setDeleting(null);
        }}
      />
    </section>
  );
}

type SourceState = { id: string; kind: "HTTP_SCRAPER" | "APIFY"; url: string; token: string; actorId: string; label: string; enabled: boolean };

const stateOf = (source: ExternalSourceView | null): SourceState => ({
  id: source?.id ?? "",
  kind: source?.kind ?? "HTTP_SCRAPER",
  url: source?.url ?? "",
  token: "",
  actorId: "",
  label: source?.label ?? "",
  enabled: source?.enabled ?? true,
});

/** The form for one source. Editing keeps its id — it names the Setting row. */
function SourceEditor({ initial, onCancel, onSaved }: { initial: ExternalSourceView | null; onCancel: () => void; onSaved: () => void }) {
  const [state, setState] = useState<SourceState>(() => stateOf(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<SourceState>) => {
    setError(null);
    setState((current) => ({ ...current, ...patch }));
  };

  const submit = () =>
    startTransition(async () => {
      if (!state.id.trim()) return setError("Name the source, e.g. my-scraper.");
      if (!state.label.trim()) return setError("Give the source a label to show in profiles.");
      if (state.kind === "HTTP_SCRAPER" && !state.url.trim()) return setError("Give the scraper's web address.");
      if (state.kind === "APIFY" && !state.actorId.trim()) return setError("Give the Apify actor's id.");
      if (state.kind === "APIFY" && !initial?.hasToken && !state.token) return setError("Give the Apify token.");
      const result = toastResult(
        await saveExternalSource({
          id: state.id,
          kind: state.kind,
          url: state.url,
          // An empty token keeps the saved one; a token is never shown again.
          token: state.token,
          actorId: state.actorId,
          label: state.label,
          enabled: state.enabled,
        }),
      );
      if (!result.ok) return;
      toast(initial ? "Source saved." : "Source added.");
      onSaved();
    });

  return (
    <Card padding="none" className="flex flex-col gap-5 px-7 py-[26px]">
      <div className="grid gap-x-[18px] gap-y-5 sm:grid-cols-2">
        <Input
          label="Name"
          hint={initial ? "The source's name is fixed once saved." : "Lower-case letters, digits and dashes, e.g. my-scraper."}
          value={state.id}
          error={error && state.id.trim() === "" ? error : undefined}
          disabled={initial !== null}
          onChange={(event) => set({ id: event.target.value })}
        />
        <Input label="Label" hint="Shown in profiles' External source select." value={state.label} onChange={(event) => set({ label: event.target.value })} />
        <Select label="Kind" value={state.kind} onChange={(event) => set({ kind: event.target.value as SourceState["kind"] })}>
          <option value="HTTP_SCRAPER">{KIND_LABELS.HTTP_SCRAPER}</option>
          <option value="APIFY">{KIND_LABELS.APIFY}</option>
        </Select>
        <Toggle
          className="self-end pb-1"
          label="Enabled"
          description={state.enabled ? "On. Profiles may search it." : "Off. Profiles searching it fail their runs until it's back on."}
          checked={state.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
        />
        {state.kind === "HTTP_SCRAPER" ? (
          <>
            <Input
              className="sm:col-span-2"
              label="Scraper address"
              hint="A public web address. Dossier posts the search to it and reads { postings: [...] } back."
              value={state.url}
              onChange={(event) => set({ url: event.target.value })}
            />
            <Input
              className="sm:col-span-2"
              label="Bearer token"
              type="password"
              hint="Optional, sent as the authorization header. It stays on the server; saved ones show “Saved”."
              placeholder={initial?.hasToken ? "Saved" : ""}
              value={state.token}
              onChange={(event) => set({ token: event.target.value })}
            />
          </>
        ) : (
          <>
            <Input label="Actor id" hint="e.g. someone~my-scraper." value={state.actorId} onChange={(event) => set({ actorId: event.target.value })} />
            <Input
              label="Apify token"
              type="password"
              hint="It stays on the server; saved ones show “Saved”."
              placeholder={initial?.hasToken ? "Saved" : ""}
              value={state.token}
              onChange={(event) => set({ token: event.target.value })}
            />
          </>
        )}
      </div>
      {error && state.id.trim() !== "" && (
        <p role="alert" className="text-label text-error">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button aria-disabled={pending || undefined} onClick={() => !pending && submit()}>
          {pending ? "Saving…" : initial ? "Save source" : "Add source"}
        </Button>
      </div>
    </Card>
  );
}
