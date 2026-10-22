// A site's settings, checked by the admin form and enforced by the server
// with the same rules (ADR 0023). Imported by `convex/`, so relative imports
// only.

/** When a site's collection cycle runs, in the site's time zone. */
export type SiteCadence = {
  businessIntervalMinutes: number;
  otherIntervalMinutes: number;
  businessStartMinute: number;
  businessEndMinute: number;
  /** ISO weekdays: 1 is Monday, 7 is Sunday. */
  businessDays: Array<number>;
};

export type SiteSettings = {
  name: string;
  timezone: string;
  cadence: SiteCadence;
  automaticRefresh: boolean;
  manualRefresh: boolean;
};

export const DEFAULT_TIMEZONE = "Europe/Paris";

export const DEFAULT_CADENCE: SiteCadence = {
  businessIntervalMinutes: 5,
  otherIntervalMinutes: 60,
  businessStartMinute: 7 * 60,
  businessEndMinute: 20 * 60,
  businessDays: [1, 2, 3, 4, 5],
};

export const SITE_NAME_MAX_LENGTH = 80;

// LibreNMS is asked for at most one discovery per five minutes and site, so
// no cycle may come sooner.
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 24 * 60;

export const WEEKDAYS = [
  { day: 1, label: "Lundi", short: "Lun" },
  { day: 2, label: "Mardi", short: "Mar" },
  { day: 3, label: "Mercredi", short: "Mer" },
  { day: 4, label: "Jeudi", short: "Jeu" },
  { day: 5, label: "Vendredi", short: "Ven" },
  { day: 6, label: "Samedi", short: "Sam" },
  { day: 7, label: "Dimanche", short: "Dim" },
] as const;

export function isTimeZone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const isInterval = (minutes: number) =>
  Number.isInteger(minutes) &&
  minutes >= MIN_INTERVAL_MINUTES &&
  minutes <= MAX_INTERVAL_MINUTES;

const isMinuteOfDay = (minute: number) =>
  Number.isInteger(minute) && minute >= 0 && minute <= 24 * 60;

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
export type SiteField =
  | "name"
  | "timezone"
  | "businessIntervalMinutes"
  | "otherIntervalMinutes"
  | "businessHours"
  | "businessDays";

export type SiteProblem = { field: SiteField; message: string };

/** "de 5 à 1 440 minutes", with French digit grouping. */
export const INTERVAL_RANGE = `de ${MIN_INTERVAL_MINUTES} à ${MAX_INTERVAL_MINUTES.toLocaleString("fr-FR")} minutes`;

const INTERVAL_BOUNDS = `${INTERVAL_RANGE} (24 heures)`;

/** The first problem with a cadence, in French for the admin. */
export function cadenceProblem(cadence: SiteCadence): SiteProblem | null {
  if (!isInterval(cadence.businessIntervalMinutes)) {
    return {
      field: "businessIntervalMinutes",
      message: `L'intervalle en heures ouvrées va ${INTERVAL_BOUNDS}.`,
    };
  }
  if (!isInterval(cadence.otherIntervalMinutes)) {
    return {
      field: "otherIntervalMinutes",
      message: `L'intervalle hors heures ouvrées va ${INTERVAL_BOUNDS}.`,
    };
  }
  if (
    !isMinuteOfDay(cadence.businessStartMinute) ||
    !isMinuteOfDay(cadence.businessEndMinute) ||
    cadence.businessStartMinute >= cadence.businessEndMinute
  ) {
    return {
      field: "businessHours",
      message: "Les heures ouvrées commencent avant de finir.",
    };
  }
  const days = new Set(cadence.businessDays);
  if (
    days.size !== cadence.businessDays.length ||
    cadence.businessDays.some(
      (day) => !Number.isInteger(day) || day < 1 || day > 7,
    )
  ) {
    return {
      field: "businessDays",
      message: "Les jours ouvrés sont invalides.",
    };
  }
  return null;
}

export function cadenceError(cadence: SiteCadence): string | null {
  return cadenceProblem(cadence)?.message ?? null;
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
  return cadenceProblem(settings.cadence);
}

/** The first problem with a site's settings, in French for the admin. */
export function siteSettingsError(settings: SiteSettings): string | null {
  return siteSettingsProblem(settings)?.message ?? null;
}

/** Refused by the server; the form shows it under the name. */
export const SITE_NAME_TAKEN = "Un site porte déjà ce nom.";

/** "07:30" for 450. */
export function formatMinuteOfDay(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * What an admin typed for a time of day, tidied: "7" → "07:00", "730" →
 * "07:30", "7:5" stays as typed so the form can refuse it. Anything that is
 * not a time comes back unchanged.
 */
export function tidyTimeOfDay(value: string): string {
  const text = value.trim().replace(/[h.]/i, ":");
  const match = /^(\d{1,2})(?::(\d{2})|(\d{2}))?$/.exec(text);
  if (!match) return value.trim();
  const hours = match[1].padStart(2, "0");
  const minutes = match.at(2) ?? match.at(3) ?? "00";
  return `${hours}:${minutes}`;
}

/** 450 for "07:30"; null for anything else. */
export function parseMinuteOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}
