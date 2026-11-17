"use client";

import { useState, useTransition } from "react";
import { z } from "zod";

import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import type { ExternalSourceView } from "@/lib/discovery/external";
import type { ProfileCriteria, ProfileQuery } from "@/lib/discovery/profile";
import type { Country } from "@/lib/job-search/countries";
import { DEFAULT_RADIUS_KM, JOB_SOURCES, searchQuerySchema, type JobSource, type RadiusKm } from "@/lib/job-search/search";
import { SOURCE_INFO } from "@/lib/job-search/sources";
import { SearchScheduleKind } from "@/generated/prisma/enums";

import { saveSearchProfile } from "./actions";
import { RemoteOnlyField, SearchFields } from "../jobs/search-fields";

// The profile editor (master.md §2.2): every field of a search profile, in
// cards. The authoritative validation is the action's searchProfileInputSchema
// (src/lib/discovery/profile.ts, server-side); the schema below mirrors it so
// the form can say what's wrong before anything is sent.

export type ProfileFormValues = {
  name: string;
  enabled: boolean;
  source: JobSource;
  query: ProfileQuery;
  criteria: ProfileCriteria;
  remotePreference: "REMOTE_ONLY" | "REMOTE_OR_HYBRID" | "ONSITE_OK";
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  companySize: string;
  startupOnly: boolean;
  timeZone: string;
  scheduleKind: SearchScheduleKind;
  cron: string;
  maxJobsPerRun: number;
};

/** The pipeline's stages, spelled as JobAssessment.stage spells them. */
const DISCOVERY_STAGES = ["DETERMINISTIC", "KEYWORD", "SCREENED", "ASSESSED"] as const;
type DiscoveryStage = (typeof DISCOVERY_STAGES)[number];
type DiscoveryStageStrings = Record<DiscoveryStage, string>;

const STAGE_LABELS: DiscoveryStageStrings = {
  DETERMINISTIC: "Deterministic filters",
  KEYWORD: "Keyword matching",
  SCREENED: "AI screen",
  ASSESSED: "Deep assessment",
};

const REMOTE_PREFERENCES = ["REMOTE_ONLY", "REMOTE_OR_HYBRID", "ONSITE_OK"] as const;
const REMOTE_PREFERENCE_LABELS: Record<(typeof REMOTE_PREFERENCES)[number], string> = {
  REMOTE_ONLY: "Remote only",
  REMOTE_OR_HYBRID: "Remote or hybrid",
  ONSITE_OK: "On-site is fine too",
};

const SCHEDULE_LABELS: Record<SearchScheduleKind, string> = {
  HOURLY: "Every hour",
  EVERY_6_HOURS: "Every 6 hours",
  DAILY: "Daily",
  WEEKDAYS: "Weekdays",
  CRON: "On a cron schedule",
};

/** As the schema's stringList, but from a comma-separated field. */
const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const listField = z.array(z.string().trim().min(1).max(300)).max(200);

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Give the profile a name.").max(200),
    enabled: z.boolean(),
    source: z.enum(JOB_SOURCES),
    query: searchQuerySchema.extend({
      externalSourceId: z.string().trim().min(1).max(100).optional(),
      skipStages: z.array(z.enum(DISCOVERY_STAGES)).max(DISCOVERY_STAGES.length),
    }),
    criteria: z.object({
      titles: listField,
      altTitles: listField,
      requiredKeywords: listField,
      excludedKeywords: listField,
      requiredTech: listField,
      preferredTech: listField,
      excludedTech: listField,
      seniority: listField,
      employmentTypes: listField,
      remoteCountries: listField,
      companyBlacklist: listField,
      companyWhitelist: listField,
      industries: listField,
    }),
    remotePreference: z.enum(REMOTE_PREFERENCES),
    salaryMin: z.number().int().min(0).max(10_000_000).nullable(),
    salaryMax: z.number().int().min(0).max(10_000_000).nullable(),
    currency: z.string().trim().max(3),
    companySize: z
      .string()
      .trim()
      .max(50)
      .refine((size) => size === "" || /^\d+(-\d+)?$/.test(size), { error: "Use a range like 50-200, or one number." }),
    startupOnly: z.boolean(),
    timeZone: z.string().trim().max(100),
    scheduleKind: z.enum(SearchScheduleKind),
    cron: z.string().trim().max(100),
    maxJobsPerRun: z.number().int().min(1).max(100),
  })
  .refine((input) => input.salaryMax === null || input.salaryMin === null || input.salaryMax >= input.salaryMin, {
    error: "The salary maximum can't be below the minimum.",
    path: ["salaryMax"],
  })
  .refine((input) => input.scheduleKind !== SearchScheduleKind.CRON || input.cron.trim() !== "", {
    error: "A CRON schedule needs a cron expression.",
    path: ["cron"],
  });

/** The form's fields as they're edited: numbers and lists as text. */
type FormState = ReturnType<typeof stateOf>;

const stateOf = (values: ProfileFormValues | null) => ({
  name: values?.name ?? "",
  enabled: values?.enabled ?? true,
  source: values?.source ?? "JSEARCH",
  keywords: values?.query.keywords ?? "",
  place: values?.query.place ?? "",
  country: values?.query.country ?? "",
  radiusKm: values?.query.radiusKm ?? (DEFAULT_RADIUS_KM as RadiusKm),
  remoteOnly: values?.query.remoteOnly ?? false,
  postedWithin: values?.query.postedWithin ?? "any",
  externalSourceId: values?.query.externalSourceId ?? "",
  skipStages: values?.query.skipStages ?? [],
  titles: (values?.criteria.titles ?? []).join(", "),
  altTitles: (values?.criteria.altTitles ?? []).join(", "),
  requiredKeywords: (values?.criteria.requiredKeywords ?? []).join(", "),
  excludedKeywords: (values?.criteria.excludedKeywords ?? []).join(", "),
  requiredTech: (values?.criteria.requiredTech ?? []).join(", "),
  preferredTech: (values?.criteria.preferredTech ?? []).join(", "),
  excludedTech: (values?.criteria.excludedTech ?? []).join(", "),
  seniority: (values?.criteria.seniority ?? []).join(", "),
  employmentTypes: (values?.criteria.employmentTypes ?? []).join(", "),
  remoteCountries: (values?.criteria.remoteCountries ?? []).join(", "),
  companyBlacklist: (values?.criteria.companyBlacklist ?? []).join(", "),
  companyWhitelist: (values?.criteria.companyWhitelist ?? []).join(", "),
  industries: (values?.criteria.industries ?? []).join(", "),
  remotePreference: values?.remotePreference ?? "REMOTE_OR_HYBRID",
  salaryMin: values?.salaryMin?.toString() ?? "",
  salaryMax: values?.salaryMax?.toString() ?? "",
  currency: values?.currency ?? "",
  companySize: values?.companySize ?? "",
  startupOnly: values?.startupOnly ?? false,
  timeZone: values?.timeZone ?? "",
  scheduleKind: values?.scheduleKind ?? SearchScheduleKind.DAILY,
  cron: values?.cron ?? "",
  maxJobsPerRun: values?.maxJobsPerRun.toString() ?? "20",
});

/** The form's fields as the action wants them; nulls and empty lists stay empty. */
function assemble(state: FormState): unknown {
  const number = (value: string) => {
    const parsed = Number(value);
    return value.trim() === "" || !Number.isInteger(parsed) ? null : parsed;
  };
  return {
    name: state.name,
    enabled: state.enabled,
    source: state.source,
    query: {
      keywords: state.keywords,
      place: state.place,
      country: state.country,
      radiusKm: state.radiusKm,
      remoteOnly: state.remoteOnly,
      postedWithin: state.postedWithin,
      externalSourceId: state.externalSourceId || undefined,
      skipStages: state.skipStages,
    },
    criteria: {
      titles: splitList(state.titles),
      altTitles: splitList(state.altTitles),
      requiredKeywords: splitList(state.requiredKeywords),
      excludedKeywords: splitList(state.excludedKeywords),
      requiredTech: splitList(state.requiredTech),
      preferredTech: splitList(state.preferredTech),
      excludedTech: splitList(state.excludedTech),
      seniority: splitList(state.seniority),
      employmentTypes: splitList(state.employmentTypes),
      remoteCountries: splitList(state.remoteCountries),
      companyBlacklist: splitList(state.companyBlacklist),
      companyWhitelist: splitList(state.companyWhitelist),
      industries: splitList(state.industries),
    },
    remotePreference: state.remotePreference,
    salaryMin: number(state.salaryMin),
    salaryMax: number(state.salaryMax),
    currency: state.currency,
    companySize: state.companySize,
    startupOnly: state.startupOnly,
    timeZone: state.timeZone,
    scheduleKind: state.scheduleKind,
    cron: state.cron,
    maxJobsPerRun: number(state.maxJobsPerRun) ?? 20,
  };
}

/** The issues keyed by their path ("query.place", "salaryMax"), first message wins. */
function errorMap(error: z.ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    map[key] ??= issue.message;
  }
  return map;
}

/** All the IANA zones the browser knows, for the time zone select. */
const TIME_ZONES = Intl.supportedValuesOf("timeZone");

/**
 * Creates a profile, or rewrites the one `initial` came from. The action
 * validates again; its field errors land on the same fields.
 */
export function ProfileEditor({
  id,
  initial,
  sources,
  countries,
  onCancel,
  onSaved,
}: {
  /** The profile being edited; null creates a new one. */
  id: string | null;
  initial: ProfileFormValues | null;
  sources: ExternalSourceView[];
  countries: readonly Country[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, setState] = useState<FormState>(() => stateOf(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<FormState>) => {
    setErrors({});
    setState((current) => ({ ...current, ...patch }));
  };
  const query = { keywords: state.keywords, place: state.place, country: state.country, radiusKm: state.radiusKm, remoteOnly: state.remoteOnly, postedWithin: state.postedWithin };
  const skip = (stage: DiscoveryStage) => set({ skipStages: state.skipStages.includes(stage) ? state.skipStages.filter((kept) => kept !== stage) : [...state.skipStages, stage] });

  const submit = () =>
    startTransition(async () => {
      const parsed = formSchema.safeParse(assemble(state));
      if (!parsed.success) {
        setErrors(errorMap(parsed.error));
        return;
      }
      const result = await saveSearchProfile({ id: id ?? undefined, profile: parsed.data });
      if (!result.ok) return toast(result.error);
      toast(initial ? "Profile saved." : "Profile created.");
      onSaved();
    });

  return (
    <section aria-labelledby="discovery-editor" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="discovery-editor" className="font-serif text-section">
          {initial ? "Edit profile" : "New profile"}
        </h2>
      </div>

      <Card padding="none" className="grid gap-x-[18px] gap-y-5 px-7 py-[26px] sm:grid-cols-2">
        <Input label="Name" value={state.name} error={errors.name} placeholder="Senior backend, Germany" onChange={(event) => set({ name: event.target.value })} />
        <Toggle
          className="self-end pb-1"
          label="Enabled"
          description={state.enabled ? "On. It comes due on its schedule below." : "Off. Nothing runs until it's on."}
          checked={state.enabled}
          onCheckedChange={(enabled) => set({ enabled })}
        />
      </Card>

      <Card padding="none" className="flex flex-col gap-4 px-7 py-[26px]">
        <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2">
          <Select label="Source" hint="The built-in source the search asks." value={state.source} onChange={(event) => set({ source: event.target.value as JobSource, externalSourceId: "" })}>
            {JOB_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_INFO[source].name}
              </option>
            ))}
          </Select>
          <Select
            label="External source"
            hint="Or one of your own scrapers instead of the built-in."
            value={state.externalSourceId}
            onChange={(event) => set({ externalSourceId: event.target.value })}
          >
            <option value="">None</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:col-span-2 sm:grid-cols-2">
          <SearchFields
            value={query}
            onChange={(patch) => set(patch)}
            source={state.externalSourceId ? null : state.source}
            countries={countries}
            errors={{ keywords: errors["query.keywords"], country: errors["query.country"] }}
          />
          <div className="sm:col-span-2">
            <RemoteOnlyField value={query} onChange={(patch) => set(patch)} source={state.externalSourceId ? null : state.source} />
          </div>
        </div>
      </Card>

      <Card padding="none" className="flex flex-col gap-4 px-7 py-[26px]">
        <div className="flex flex-col gap-1">
          <h3 className="text-field font-medium">Stages to skip</h3>
          <p className="text-meta text-muted">Every stage can be left out of this profile&rsquo;s runs. With the AI stages off, postings are only shortlisted by keyword score.</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {DISCOVERY_STAGES.map((stage) => (
            <Checkbox key={stage} label={`Skip ${STAGE_LABELS[stage].toLowerCase()}`} checked={state.skipStages.includes(stage)} onChange={() => skip(stage)} />
          ))}
        </div>
      </Card>

      <ListFieldsCard state={state} errors={errors} set={set} />

      <Card padding="none" className="grid gap-x-[18px] gap-y-5 px-7 py-[26px] sm:grid-cols-2">
        <Select label="Remote work" value={state.remotePreference} onChange={(event) => set({ remotePreference: event.target.value as FormState["remotePreference"] })}>
          {REMOTE_PREFERENCES.map((preference) => (
            <option key={preference} value={preference}>
              {REMOTE_PREFERENCE_LABELS[preference]}
            </option>
          ))}
        </Select>
        <Input
          label="Company size"
          hint="A range like 50-200, or one number. Postings that state a size outside it are filtered out."
          value={state.companySize}
          error={errors.companySize}
          placeholder="50-200"
          onChange={(event) => set({ companySize: event.target.value })}
        />
        <Input label="Minimum salary" hint="A year, in the currency below. Postings that state less are filtered out." value={state.salaryMin} error={errors.salaryMin} inputMode="numeric" onChange={(event) => set({ salaryMin: event.target.value })} />
        <Input label="Maximum salary" hint="Left empty, no maximum." value={state.salaryMax} error={errors.salaryMax} inputMode="numeric" onChange={(event) => set({ salaryMax: event.target.value })} />
        <Input label="Currency" hint="Three letters, e.g. EUR." value={state.currency} error={errors.currency} placeholder="EUR" onChange={(event) => set({ currency: event.target.value.toUpperCase() })} />
        <Checkbox className="self-end pb-1" label="Startups only" hint="Postings that read like big companies are filtered out." checked={state.startupOnly} onChange={(event) => set({ startupOnly: event.target.checked })} />
      </Card>

      <Card padding="none" className="grid gap-x-[18px] gap-y-5 px-7 py-[26px] sm:grid-cols-2">
        <Select label="Schedule" value={state.scheduleKind} onChange={(event) => set({ scheduleKind: event.target.value as SearchScheduleKind })}>
          {Object.values(SearchScheduleKind).map((kind) => (
            <option key={kind} value={kind}>
              {SCHEDULE_LABELS[kind]}
            </option>
          ))}
        </Select>
        {state.scheduleKind === SearchScheduleKind.CRON && (
          <Input
            label="Cron expression"
            hint="Five fields: minute, hour, day of month, month and day of week — e.g. “0 9 * * 1-5”."
            value={state.cron}
            error={errors.cron}
            placeholder="0 9 * * 1-5"
            onChange={(event) => set({ cron: event.target.value })}
          />
        )}
        <Select label="Time zone" hint="For weekday and cron schedules; empty follows the server&rsquo;s." value={state.timeZone} onChange={(event) => set({ timeZone: event.target.value })}>
          <option value="">The server&rsquo;s time zone</option>
          {TIME_ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </Select>
        <Input
          label="Postings assessed per run, at most"
          hint="The best-matching postings go first."
          value={state.maxJobsPerRun}
          error={errors.maxJobsPerRun}
          inputMode="numeric"
          onChange={(event) => set({ maxJobsPerRun: event.target.value })}
        />
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button aria-disabled={pending || undefined} onClick={() => !pending && submit()}>
          {pending ? "Saving…" : initial ? "Save profile" : "Create profile"}
        </Button>
      </div>
    </section>
  );
}

/** The criteria lists (master.md §2.2), comma-separated. */
type ListKey = "titles" | "altTitles" | "requiredKeywords" | "excludedKeywords" | "requiredTech" | "preferredTech" | "excludedTech" | "seniority" | "employmentTypes" | "remoteCountries" | "companyBlacklist" | "companyWhitelist" | "industries";

function ListFieldsCard({ state, errors, set }: { state: FormState; errors: Record<string, string>; set: (patch: Partial<FormState>) => void }) {
  const fields: readonly { key: ListKey; label: string; hint?: string; placeholder?: string }[] = [
    { key: "titles", label: "Titles", placeholder: "Senior Backend Engineer" },
    { key: "altTitles", label: "Alternative titles", placeholder: "Staff Engineer" },
    { key: "requiredKeywords", label: "Required keywords", hint: "Every one must appear in the posting." },
    { key: "excludedKeywords", label: "Excluded keywords", hint: "In a posting's title, it's filtered out." },
    { key: "requiredTech", label: "Required technology", placeholder: "Node.js" },
    { key: "preferredTech", label: "Preferred technology", placeholder: "Kafka" },
    { key: "excludedTech", label: "Excluded technology", placeholder: "Rails" },
    { key: "seniority", label: "Seniority", hint: "Free text the filters and prompts read." },
    { key: "employmentTypes", label: "Employment types", hint: "As the sources spell them: FULL_TIME, PART_TIME, CONTRACT, INTERN, FREELANCE, TEMPORARY, APPRENTICE." },
    { key: "remoteCountries", label: "Remote work countries", hint: "Country codes or names the candidate can work remote from." },
    { key: "companyBlacklist", label: "Companies to avoid" },
    { key: "companyWhitelist", label: "Companies of interest", hint: "Bypass the exclusions above, never the salary floor." },
    { key: "industries", label: "Industries", placeholder: "fintech" },
  ];
  return (
    <Card padding="none" className="grid gap-x-[18px] gap-y-5 px-7 py-[26px] sm:grid-cols-2">
      {fields.map((field) => (
        <Input
          key={field.key}
          label={field.label}
          hint={field.hint ?? "Comma-separated."}
          value={state[field.key]}
          error={errors[`criteria.${field.key}`]}
          placeholder={field.placeholder}
          onChange={(event) => set({ [field.key]: event.target.value } as Partial<FormState>)}
        />
      ))}
    </Card>
  );
}
