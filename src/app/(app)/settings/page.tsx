import type { Metadata } from "next";
import { headers } from "next/headers";

import { AiProvider } from "@/generated/prisma/enums";
import { budgetExceeded } from "@/lib/ai/budget";
import { loadAiConfig, loadAiSettingsView } from "@/lib/ai/config";
import { jobSearchView, loadJobSearchConfig } from "@/lib/job-search/config";
import { COUNTRIES } from "@/lib/job-search/countries";
import { isDesktopApp } from "@/lib/desktop";
import { loadSearch } from "@/lib/posting-searches";
import { listAgentSearches } from "@/lib/agent/searches";
import { providerOption } from "@/lib/ai/provider-options";
import { lastNightlyBackup } from "@/lib/backup-schedule";
import { backupsDir } from "@/lib/backups";
import { mcpUrl } from "@/lib/connector/oauth";
import { exportFileName } from "@/lib/data-export";
import { isSqliteUrl } from "@/lib/database";
import { env } from "@/lib/env";
import { redirectUri } from "@/lib/google/oauth";
import { googleClientView, googleView, requestOrigin, whenRan } from "@/lib/settings-views";
import { lastKnownTimeZone, userTimeZone } from "@/lib/time-zone";
import { appVersion } from "@/lib/version";
import { prisma } from "@/lib/prisma";
import { loadProfileName } from "@/lib/profile-data";
import { scoringProblem } from "@/lib/scoring";
import { loadScoringConfig, scoringView } from "@/lib/scoring/config";
import { loadSettings } from "@/lib/settings-data";
import { googleConnection } from "@/lib/google/account";
import { availableUpdate } from "@/lib/update-check";
import { USAGE_PING_HOST, usagePingChoice } from "@/lib/usage-ping";

import { AgentSection } from "./agent-section";
import { AiBehaviour } from "./ai-behaviour";
import { AiProviderSection } from "./ai-provider-section";
import { AiRoutingSection, type TaskRoutingRow, type UsageView } from "./ai-routing-section";
import { DigestSection } from "./digest-section";
import { DataSection } from "./data-section";
import { DocumentsSection } from "./documents-section";
import { GoogleSection } from "./google-section";
import { GoogleNotice } from "./google-notice";
import { JobSearchSection } from "./job-search-section";
import { ScoringSection } from "./scoring-section";
import { AboutSection, type AboutFacts, type UsagePingView } from "./about-section";
import { ConnectorSection } from "./connector-section";
import { ROUTING_TASKS, settingsSectionFromParam } from "./sections";
import { SettingsScreen } from "./settings-screen";

export const metadata: Metadata = { title: "Settings" };

/** Settings (PRD §6.8); the section is in `?section=` (E10-1). */
export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const params = await searchParams;
  const section = settingsSectionFromParam(params.section);
  const settings = await loadSettings();

  return (
    <SettingsScreen section={section}>
      {section === "ai" ? (
        <>
          <AiProviderSection initial={await loadAiSettingsView()} />
          <AiBehaviour initial={{ creativity: settings.creativity, strict: settings.strict, showDiff: settings.showDiff }} />
        </>
      ) : section === "ai-routing" ? (
        <AiRoutingSection
          {...await aiRoutingView()}
          usage={await usageView()}
          budgets={{
            dailyCents: settings.aiBudgetDailyCents,
            monthlyCents: settings.aiBudgetMonthlyCents,
            stop: settings.aiBudgetStop,
            status: await budgetExceeded(),
          }}
        />
      ) : section === "jobs" ? (
        <JobSearchSection initial={jobSearchView(await loadJobSearchConfig())} />
      ) : section === "scoring" ? (
        <ScoringSection initial={scoringView(await loadScoringConfig())} />
      ) : section === "agent" ? (
        <AgentSection
          initial={{
            enabled: settings.agentEnabled,
            hour: settings.agentHour,
            minScore: settings.agentMinScore,
            maxScores: settings.agentMaxScores,
            maxDrafts: settings.agentMaxDrafts,
            autoDraft: settings.agentAutoDraft,
          }}
          searches={await listAgentSearches()}
          suggestedQuery={(await loadSearch())?.query}
          source={(await loadJobSearchConfig()).source}
          scoring={await scoringReadiness()}
          countries={COUNTRIES}
          timeZone={await lastKnownTimeZone()}
          onlyWhileOpen={isDesktopApp()}
        />
      ) : section === "automation" ? (
        <DigestSection
          initial={{
            enabled: settings.digestEnabled,
            hour: settings.digestHour,
            includeMarkdown: settings.digestIncludeMarkdown,
            emailEnabled: settings.digestEmailEnabled,
          }}
          emailAvailable={await canEmailDigest()}
          timeZone={await lastKnownTimeZone()}
        />
      ) : section === "google" ? (
        <>
          <GoogleNotice outcome={typeof params.google === "string" ? params.google : null} />
          <GoogleSection
            connection={await googleView()}
            client={await googleClientView()}
            browserTimeZone={(await userTimeZone()) ?? null}
            redirectUri={redirectUri(await requestOrigin())}
            inDesktopApp={isDesktopApp()}
            initial={{
              gmailRead: settings.gmailRead,
              gmailScope: settings.gmailScope,
              gmailInterval: settings.gmailInterval,
              calendarAvailability: settings.calendarAvailability,
              calendarEvents: settings.calendarEvents,
              calendarId: settings.calendarId,
              workDays: settings.workDays,
              workStart: settings.workStart,
              workEnd: settings.workEnd,
              workTimeZone: settings.workTimeZone,
              slotMinutes: settings.slotMinutes,
              bufferMinutes: settings.bufferMinutes,
            }}
          />
        </>
      ) : section === "connector" ? (
        <ConnectorSection
          initial={{ on: settings.connectorEnabledAt !== null, redirects: settings.connectorRedirects }}
          address={mcpUrl(env.DOSSIER_PUBLIC_URL ?? (await requestOrigin()))}
          inDesktopApp={isDesktopApp()}
        />
      ) : section === "data" ? (
        <DataSection
          hasApiKey={[settings.apiKeyEnc, settings.jsearchKeyEnc, settings.adzunaKeyEnc].some((key) => key !== null)}
          exportName={exportFileName()}
          backups={{
            on: settings.nightlyBackup,
            retentionDays: env.DOSSIER_BACKUP_RETENTION_DAYS,
            dir: backupsDir(),
            lastRun: whenRan(await lastNightlyBackup()),
            problem: settings.backupProblem,
            onlyWhileOpen: isDesktopApp(),
          }}
          jobRetentionHours={settings.jobRetentionHours}
        />
      ) : section === "documents" ? (
        <DocumentsSection
          // Only these fields: the settings also hold the encrypted API key, which never leaves the server.
          initial={{
            paper: settings.paper,
            dateFormat: settings.dateFormat,
            defaultTone: settings.defaultTone,
            docLanguage: settings.docLanguage,
            resumeLanguage: settings.resumeLanguage,
            customLanguages: settings.customLanguages,
            fileNamePattern: settings.fileNamePattern,
            includeRefs: settings.includeRefs,
            documentsToWrite: settings.documentsToWrite,
          }}
          preview={await filePreview()}
        />
      ) : (
        <AboutSection
          facts={await aboutFacts()}
          usagePing={await usagePingView()}
          updates={{ daily: settings.updateCheck, available: availableUpdate(settings) }}
        />
      )}
    </SettingsScreen>
  );
}

/** What scores the job agent's postings, and whether it's set up (#274). */
async function scoringReadiness() {
  const config = await loadScoringConfig();
  return { scorer: config.scorer, ready: (await scoringProblem(config)) === null };
}

// Settings → AI models & usage (master.md §11.3–11.4).

/** The routing rows in display order, with the app provider and model they fall back to. */
async function aiRoutingView(): Promise<{ rows: TaskRoutingRow[]; appDefault: { providerName: string; model: string } }> {
  const [config, saved] = await Promise.all([loadAiConfig(), prisma.aiTaskConfig.findMany()]);
  const byTask = new Map(saved.map((row) => [row.id, row]));
  // A saved kind the app no longer knows falls back to the app's provider.
  const kindOf = (choice: string): AiProvider =>
    (Object.values(AiProvider) as string[]).includes(choice) ? (choice as AiProvider) : config.provider;
  const rows: TaskRoutingRow[] = ROUTING_TASKS.map(({ key, label, description }) => {
    const row = byTask.get(key) ?? null;
    return {
      task: key,
      label,
      description,
      enabled: row?.enabled ?? true,
      providerChoice: row?.provider ?? "",
      providerName: providerOption(kindOf(row?.provider ?? "")).name,
      savedModel: row?.model ?? "",
      resolvedModel: (row?.model.trim() || config.model) ?? "",
      temperature: row?.temperature ?? "",
      maxTokens: row?.maxTokens ?? null,
      timeoutSeconds: row?.timeoutSeconds ?? null,
      retries: row?.retries ?? null,
      fallbackModel: row?.fallbackModel ?? "",
      contextLimit: row?.contextLimit ?? null,
      maxConcurrency: row?.maxConcurrency ?? null,
    };
  });
  return { rows, appDefault: { providerName: providerOption(config.provider).name, model: config.model ?? "" } };
}

/** The 30-day usage per task (master.md §11.4): only what providers reported, never an estimate. */
async function usageView(): Promise<UsageView> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [groups, reporting, cost] = await Promise.all([
    prisma.aiUsage.groupBy({
      by: ["task"],
      where: { createdAt: { gte: since } },
      _count: { _all: true, inputTokens: true },
      _sum: { inputTokens: true, outputTokens: true, durationMs: true },
    }),
    prisma.aiUsage.groupBy({ by: ["task"], where: { createdAt: { gte: since }, inputTokens: { not: null } } }),
    prisma.aiUsage.aggregate({ _sum: { estimatedCost: true }, where: { createdAt: { gte: since } } }),
  ]);
  const labelOf = new Map<string, string>(ROUTING_TASKS.map((task) => [task.key, task.label]));
  const reported = new Set(reporting.map((row) => row.task));
  const tasks: UsageView["tasks"] = groups
    .map((row) => ({
      task: row.task,
      label: labelOf.get(row.task) ?? row.task,
      calls: row._count._all,
      failures: row._count._all - row._count.inputTokens,
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      durationMs: row._sum.durationMs ?? 0,
      reportsTokens: reported.has(row.task),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { tasks, anyCost: cost._sum.estimatedCost !== null, totalCostCents: cost._sum.estimatedCost ?? 0 };
}

/** Whether the connected Gmail account may send: only then can the digest be emailed. */
async function canEmailDigest(): Promise<boolean> {
  const connection = await googleConnection();
  return connection.status === "connected" && connection.canSend;
}




/** The file name preview uses your name and your latest application, or sample values (SET-8). */
async function filePreview() {
  const [name, latest] = await Promise.all([
    loadProfileName(),
    prisma.application.findFirst({ where: { awaitingReview: false }, orderBy: { createdAt: "desc" }, select: { company: true, role: true } }),
  ]);
  return {
    name: name.trim() || "Jane Doe",
    company: latest?.company.trim() || "Ledgerly",
    role: latest?.role.trim() || "Senior Product Designer",
  };
}


/** "12.4 MB" */
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

/** The About rows (SET-12). */
async function aboutFacts(): Promise<AboutFacts> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim() || requestHeaders.get("host") || "Unknown";
  const sqlite = isSqliteUrl(env.DATABASE_URL);
  const [[database], ai, applications] = await Promise.all([
    sqlite
      ? prisma.$queryRaw<{ size: bigint }[]>`SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()`
      : prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
    loadAiConfig(),
    prisma.application.count({ where: { awaitingReview: false } }),
  ]);
  return [
    { label: "Version", value: appVersion },
    { label: "Server", value: host },
    { label: "Database", value: `${sqlite ? "SQLite" : "PostgreSQL"} · ${formatBytes(Number(database.size))}` },
    { label: "Sign-in", value: isDesktopApp() ? "none, on this computer" : "set via DOSSIER_PASSWORD" },
    { label: "AI", value: [providerOption(ai.provider).name, ai.model].filter(Boolean).join(" · ") },
    { label: "Applications", value: String(applications) },
  ];
}

/** The usage ping's switch in About (#172): the answer in effect, who gave it, and the install ID. */
async function usagePingView(): Promise<UsagePingView> {
  const settings = await loadSettings();
  return { host: USAGE_PING_HOST, ...usagePingChoice(settings), id: settings.usagePingId, production: process.env.NODE_ENV === "production" };
}
