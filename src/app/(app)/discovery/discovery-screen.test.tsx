import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/toast";
import { RunStatus } from "@/generated/prisma/enums";
import { COUNTRIES } from "@/lib/job-search/countries";
import type { ExternalSourceView } from "@/lib/discovery/external";

import { deleteSearchProfile, runProfileNow, setProfileEnabled } from "./actions";
import { DiscoveryScreen, type DiscoveryProfileView, type DiscoveryRunView } from "./discovery-screen";
import type { ProfileFormValues } from "./profile-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/discovery" }));
vi.mock("@/hooks/use-job", () => ({ useJob: () => null }));
vi.mock("@/components/toast", () => ({ toast: vi.fn(), toastResult: (result: { ok: boolean }) => result }));
vi.mock("./actions", () => ({
  saveSearchProfile: vi.fn(async () => ({ ok: true, data: null })),
  deleteSearchProfile: vi.fn(async () => ({ ok: true, data: null })),
  setProfileEnabled: vi.fn(async () => ({ ok: true, data: null })),
  runProfileNow: vi.fn(async () => ({ ok: true, data: { jobId: "run-1", reused: false } })),
  saveExternalSource: vi.fn(async () => ({ ok: true, data: null })),
  deleteExternalSource: vi.fn(async () => ({ ok: true, data: null })),
}));

const draft: ProfileFormValues = {
  name: "Senior backend",
  enabled: true,
  source: "JSEARCH",
  query: { keywords: "node.js backend", place: "Berlin", country: "de", radiusKm: 50, remoteOnly: false, postedWithin: "week", skipStages: [] },
  criteria: {
    titles: ["Senior Backend Engineer"],
    altTitles: [],
    requiredKeywords: [],
    excludedKeywords: [],
    requiredTech: ["Node.js"],
    preferredTech: [],
    excludedTech: [],
    seniority: [],
    employmentTypes: [],
    remoteCountries: [],
    companyBlacklist: [],
    companyWhitelist: [],
    industries: [],
  },
  remotePreference: "REMOTE_OR_HYBRID",
  salaryMin: 60000,
  salaryMax: null,
  currency: "EUR",
  companySize: "",
  startupOnly: false,
  timeZone: "Europe/Berlin",
  scheduleKind: "DAILY",
  cron: "",
  maxJobsPerRun: 20,
};

const profile = (changes: Partial<DiscoveryProfileView> = {}): DiscoveryProfileView => ({
  id: "p1",
  name: "Senior backend",
  enabled: true,
  sourceName: "JSearch",
  search: "node.js backend · Berlin, 50 km · Germany · via JSearch",
  schedule: "Daily",
  lastRunAt: null,
  lastStats: null,
  runProblem: null,
  runJobId: null,
  draft,
  ...changes,
});

const run = (changes: Partial<DiscoveryRunView> = {}): DiscoveryRunView => ({
  id: "r1",
  profileName: "Senior backend",
  status: RunStatus.DONE,
  step: null,
  startedAt: "Tue 17 Nov, 08:00",
  finishedAt: "Tue 17 Nov, 08:02",
  error: null,
  stats: { fetched: 6, duplicates: 1, deterministicRejected: 4, screened: 1, shortlisted: 1, assessed: 1, failed: 0, message: "Found 6 postings." },
  tokens: "12,345 in · 4,567 out",
  postings: [
    {
      id: "a1",
      title: "Senior Backend Engineer",
      company: "Ledgerly",
      url: "https://jobs.example/1",
      stage: "ASSESSED",
      decision: "STRONG_MATCH",
      score: 85,
      confidence: "HIGH",
      reasons: ["Strong fit."],
      rejectedReason: "",
    },
  ],
  ...changes,
});

const source = (changes: Partial<ExternalSourceView> = {}): ExternalSourceView => ({
  id: "my-scraper",
  kind: "HTTP_SCRAPER",
  label: "My scraper",
  enabled: true,
  url: "https://scraper.example.com/jobs",
  hasToken: false,
  hasActor: false,
  ...changes,
});

const open = (profiles: DiscoveryProfileView[], runs: DiscoveryRunView[] = [], sources: ExternalSourceView[] = []) =>
  render(<DiscoveryScreen profiles={profiles} runs={runs} sources={sources} countries={COUNTRIES} />);

beforeEach(() => vi.clearAllMocks());

describe("DiscoveryScreen", () => {
  it("says when there's nothing yet in each section", () => {
    open([], [], []);
    expect(screen.getByRole("heading", { level: 1, name: "Discovery" })).toBeInTheDocument();
    expect(screen.getByText(/No search profiles yet/)).toBeInTheDocument();
    expect(screen.getByText("No runs yet. Run a profile now, or wait for its schedule; every run keeps what each stage did with each posting.")).toBeInTheDocument();
    expect(screen.getByText(/No external sources yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New profile" })).toBeInTheDocument();
  });

  it("shows a profile with its search, schedule, last run and actions", () => {
    open([profile({ lastRunAt: "Tue 17 Nov, 08:00", lastStats: "Found 6 postings." })]);
    const profiles = screen.getByRole("region", { name: "Search profiles" });
    expect(within(profiles).getByRole("heading", { level: 3, name: "Senior backend" })).toBeInTheDocument();
    expect(within(profiles).getByText("node.js backend · Berlin, 50 km · Germany · via JSearch")).toBeInTheDocument();
    expect(within(profiles).getByText("Daily")).toBeInTheDocument();
    expect(within(profiles).getByText("Tue 17 Nov, 08:00")).toBeInTheDocument();
    expect(within(profiles).getByText("Found 6 postings.")).toBeInTheDocument();
    expect(within(profiles).getByRole("switch", { name: "Run Senior backend on its schedule" })).toBeChecked();
    expect(within(profiles).getByRole("button", { name: "Run now" })).not.toHaveAttribute("title");
  });

  it("gates Run now with the problem in a tooltip, and says it when clicked", async () => {
    const user = userEvent.setup();
    const problem = "Add your JSearch key in Settings → Job search first.";
    open([profile({ runProblem: problem })]);
    const button = screen.getByRole("button", { name: "Run now" });
    expect(button).toHaveAttribute("title", problem);
    await user.click(button);
    expect(runProfileNow).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(problem);
  });

  it("runs a profile now on request", async () => {
    const user = userEvent.setup();
    open([profile()]);
    await user.click(screen.getByRole("button", { name: "Run now" }));
    expect(runProfileNow).toHaveBeenCalledWith({ id: "p1" });
    expect(screen.getByRole("button", { name: "Running…" })).toBeInTheDocument();
  });

  it("turns a profile on and off", async () => {
    const user = userEvent.setup();
    open([profile()]);
    await user.click(screen.getByRole("switch", { name: "Run Senior backend on its schedule" }));
    expect(setProfileEnabled).toHaveBeenCalledWith({ id: "p1", enabled: false });
  });

  it("opens the editor empty for a new profile, and filled for editing", async () => {
    const user = userEvent.setup();
    open([profile()]);
    await user.click(screen.getByRole("button", { name: "New profile" }));
    expect(screen.getByRole("heading", { level: 2, name: "New profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { level: 2, name: "Edit profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Senior backend");
    expect(screen.getByLabelText("Required technology")).toHaveValue("Node.js");
    expect(screen.queryByLabelText("Cron expression")).not.toBeInTheDocument();
  });

  it("asks before deleting a profile", async () => {
    const user = userEvent.setup();
    open([profile()]);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete this profile?" });
    expect(deleteSearchProfile).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete profile" }));
    await waitFor(() => expect(deleteSearchProfile).toHaveBeenCalledWith({ id: "p1" }));
  });

  it("lists a run with its counts, its AI use, and a failed run's error", () => {
    open([profile()], [run()]);
    const runs = screen.getByRole("region", { name: "Runs history" });
    expect(within(runs).getByText("Senior backend")).toBeInTheDocument();
    expect(within(runs).getByText("Done")).toBeInTheDocument();
    expect(within(runs).getByText("6 postings found · 1 seen before · 4 filtered out · 1 screened · 1 shortlisted · 1 assessed")).toBeInTheDocument();
    expect(within(runs).getByText("AI used 12,345 in · 4,567 out")).toBeInTheDocument();
  });

  it("shows what went wrong on a failed run", () => {
    open([profile()], [run({ status: RunStatus.FAILED, finishedAt: null, stats: null, tokens: null, error: "JSearch isn't answering right now. Try again in a minute." })]);
    const runs = screen.getByRole("region", { name: "Runs history" });
    expect(within(runs).getByText("Failed")).toBeInTheDocument();
    expect(within(runs).getByRole("alert")).toHaveTextContent("JSearch isn't answering right now. Try again in a minute.");
  });

  it("opens a run's postings, with how far each got and why", async () => {
    const user = userEvent.setup();
    open([profile()], [
      run({
        postings: [
          { id: "a1", title: "Senior Backend Engineer", company: "Ledgerly", url: "https://jobs.example/1", stage: "ASSESSED", decision: "STRONG_MATCH", score: 85, confidence: "HIGH", reasons: ["Strong fit."], rejectedReason: "" },
          { id: "a2", title: "PHP Backend Engineer", company: "Legacy Co", url: "https://jobs.example/2", stage: "DETERMINISTIC", decision: "REJECT", score: null, confidence: "", reasons: ["The title contains a keyword the profile excludes."], rejectedReason: "EXCLUDED_KEYWORD" },
        ],
      }),
    ]);
    expect(screen.queryByText("Senior Backend Engineer")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2 postings · Show" }));
    expect(screen.getByText("Senior Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText(/Strong match, 85 of 100/)).toBeInTheDocument();
    expect(screen.getByText("PHP Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("EXCLUDED_KEYWORD")).toBeInTheDocument();
    expect(screen.getByText("The title contains a keyword the profile excludes.")).toBeInTheDocument();
  });

  it("lists external sources with their kind and actions", () => {
    open([profile()], [], [source(), source({ id: "apify-one", kind: "APIFY", label: "Apify one", hasToken: true, hasActor: true })]);
    expect(screen.getByText("My scraper")).toBeInTheDocument();
    expect(screen.getByText(/HTTP scraper · scraper.example.com/)).toBeInTheDocument();
    expect(screen.getByText("Apify one")).toBeInTheDocument();
  });
});
