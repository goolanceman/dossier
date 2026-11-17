import "server-only";

import { unitsSchema } from "@/lib/application-data";
import { getMasterDocument } from "@/lib/resume-intel/master";
import { loadSettings } from "@/lib/settings-data";
import { loadThemes } from "@/lib/theme-data";

import type { MasterPreview } from "./view";

/**
 * The master document's preview data (master.md §5.5): its units with the
 * theme, paper and sections the base resume shows them in. Null when there
 * is no master document yet, or nothing to draw it with.
 */
export async function loadMasterPreview(): Promise<MasterPreview | null> {
  const [master, settings, themes] = await Promise.all([getMasterDocument(), loadSettings(), loadThemes()]);
  if (!master) return null;
  const units = unitsSchema.safeParse(master.units);
  // The document's own theme when it has one, else the base theme.
  const theme = themes.find((entry) => entry.id === (master.themeId ?? settings.baseThemeId)) ?? themes[0];
  if (!units.success || !theme) return null;
  return {
    id: master.id,
    units: units.data,
    theme,
    paper: settings.paper,
    sections: settings.resumeSections,
    includeReferences: settings.includeRefs,
    language: settings.resumeLanguage,
  };
}
