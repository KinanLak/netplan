// A site's settings, checked by the admin form and enforced by the server
// with the same rules (ADR 0023). Imported by `convex/`, so relative imports
// only.

export type SiteSettings = {
  name: string;
  timezone: string;
  /** Minutes between two cycles, day and night alike (ADR 0038). */
  intervalMinutes: number;
  automaticRefresh: boolean;
  manualRefresh: boolean;
};

export const DEFAULT_TIMEZONE = "Europe/Paris";

export const DEFAULT_INTERVAL_MINUTES = 5;

export const SITE_NAME_MAX_LENGTH = 80;

// LibreNMS is asked for at most one discovery per five minutes and site, so
// no cycle may come sooner.
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 24 * 60;

export function isTimeZone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The first problem with a site name, in French for the admin. */
export function siteNameError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Le nom du site est obligatoire.";
  if (trimmed.length > SITE_NAME_MAX_LENGTH) {
    return `Le nom du site ne dépasse pas ${SITE_NAME_MAX_LENGTH} caractères.`;
  }
  return null;
}

/** The form field a settings problem belongs to. */
export type SiteField = "name" | "timezone" | "intervalMinutes";

export type SiteProblem = { field: SiteField; message: string };

/** "de 5 à 1 440 minutes", with French digit grouping. */
export const INTERVAL_RANGE = `de ${MIN_INTERVAL_MINUTES} à ${MAX_INTERVAL_MINUTES.toLocaleString("fr-FR")} minutes`;

/** The problem with an interval between cycles, in French for the admin. */
export function intervalError(minutes: number): string | null {
  return Number.isInteger(minutes) &&
    minutes >= MIN_INTERVAL_MINUTES &&
    minutes <= MAX_INTERVAL_MINUTES
    ? null
    : `L'intervalle va ${INTERVAL_RANGE} (24 heures).`;
}

/** The first problem with a site's settings, with the field to fix. */
export function siteSettingsProblem(
  settings: SiteSettings,
): SiteProblem | null {
  const name = siteNameError(settings.name);
  if (name) return { field: "name", message: name };
  if (!isTimeZone(settings.timezone)) {
    return { field: "timezone", message: "Ce fuseau horaire est inconnu." };
  }
  const interval = intervalError(settings.intervalMinutes);
  return interval ? { field: "intervalMinutes", message: interval } : null;
}

/** The first problem with a site's settings, in French for the admin. */
export function siteSettingsError(settings: SiteSettings): string | null {
  return siteSettingsProblem(settings)?.message ?? null;
}

/** Refused by the server; the form shows it under the name. */
export const SITE_NAME_TAKEN = "Un site porte déjà ce nom.";
