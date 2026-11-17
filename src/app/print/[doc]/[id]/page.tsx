import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResumeDocument } from "@/components/documents/resume-document";
import { TailoredLetter, TailoredResume } from "@/components/documents/tailored-documents";
import type { Document } from "@/generated/prisma/client";
import { DocumentKind } from "@/generated/prisma/enums";
import { unitsSchema } from "@/lib/application-data";
import { loadDocuments, readJson } from "@/lib/application-documents";
import { verifyPrintAccess } from "@/lib/pdf/print-access";
import { printMetadata } from "@/lib/pdf/print-title";
import { loadProfile } from "@/lib/profile-data";
import { getMasterDocumentById } from "@/lib/resume-intel/master";
import { loadSettings } from "@/lib/settings-data";
import { loadTheme } from "@/lib/theme-data";
import { BUILT_IN_THEMES, printCss } from "@/lib/themes";

export async function generateMetadata({ params }: PageProps<"/print/[doc]/[id]">): Promise<Metadata> {
  const { doc, id } = await params;
  if (doc !== "resume" && doc !== "letter") notFound();
  await verifyPrintAccess(`/print/${doc}/${id}`);
  return printMetadata(doc === "resume" ? DocumentKind.RESUME : DocumentKind.COVER_LETTER);
}

/**
 * An application's tailored resume (/print/resume/{id}) or cover letter
 * (/print/letter/{id}) on its own, for the PDF renderer (E8-8) to print.
 * /print/resume/{id} also prints the master resume by its document id,
 * which has no application (master.md §5.5).
 */
export default async function PrintTailoredDocumentPage({ params }: PageProps<"/print/[doc]/[id]">) {
  const { doc, id } = await params;
  if (doc !== "resume" && doc !== "letter") notFound();
  await verifyPrintAccess(`/print/${doc}/${id}`);
  // The master resume is found by its own document id; an application id is never one of these.
  if (doc === "resume") {
    const master = await getMasterDocumentById(id);
    if (master) return <PrintMasterResume document={master} />;
  }
  const { application, profile, settings, resume, letter, includeReferences, sections, letterDate } = await loadDocuments(id);
  const document = doc === "resume" ? resume : letter;
  if (!document) notFound();

  return (
    <>
      <style>{printCss(document.theme, settings.paper)}</style>
      {doc === "resume" ? (
        <TailoredResume
          resume={document}
          profile={profile}
          paper={settings.paper}
          followThemeLayout={application.followThemeLayout}
          showPhoto={application.showPhoto}
          language={application.language}
          includeReferences={includeReferences}
          sections={sections}
        />
      ) : (
        <TailoredLetter
          letter={document}
          profile={profile}
          paper={settings.paper}
          company={application.company}
          location={application.location}
          tone={application.tone}
          date={letterDate}
          dateFormat={settings.dateFormat}
          language={application.language}
        />
      )}
    </>
  );
}

/**
 * The master resume as its own page: its units over the theme it was saved
 * with, else the base theme, the way the base resume prints (E5-5).
 */
async function PrintMasterResume({ document: master }: { document: Document }) {
  const [profile, settings] = await Promise.all([loadProfile(), loadSettings()]);
  const units = readJson(unitsSchema, master.units);
  if (!units) notFound();
  const theme = (await loadTheme(master.themeId ?? settings.baseThemeId)) ?? BUILT_IN_THEMES[0];

  return (
    <>
      <style>{printCss(theme, settings.paper)}</style>
      <ResumeDocument
        theme={theme}
        profile={profile}
        paper={settings.paper}
        units={units}
        language={settings.resumeLanguage}
        includeReferences={settings.includeRefs}
        sections={settings.resumeSections}
      />
    </>
  );
}
