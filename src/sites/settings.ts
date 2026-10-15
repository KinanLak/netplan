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

/** The first problem with a cadence, in French for the admin. */
export function cadenceError(cadence: SiteCadence): string | null {
  if (
    !isInterval(cadence.businessIntervalMinutes) ||
    !isInterval(cadence.otherIntervalMinutes)
  ) {
    return `Un intervalle va de ${MIN_INTERVAL_MINUTES} minutes à 24 heures.`;
  }
  if (
    !isMinuteOfDay(cadence.businessStartMinute) ||
    !isMinuteOfDay(cadence.businessEndMinute) ||
    cadence.businessStartMinute >= cadence.businessEndMinute
  ) {
    return "Les heures ouvrées commencent avant de finir.";
  }
  const days = new Set(cadence.businessDays);
  if (
    days.size !== cadence.businessDays.length ||
    cadence.businessDays.some(
      (day) => !Number.isInteger(day) || day < 1 || day > 7,
    )
  ) {
    return "Les jours ouvrés sont invalides.";
  }
  return null;
}

/** The first problem with a site's settings, in French for the admin. */
export function siteSettingsError(settings: SiteSettings): string | null {
  return (
    siteNameError(settings.name) ??
    (isTimeZone(settings.timezone) ? null : "Ce fuseau horaire est inconnu.") ??
    cadenceError(settings.cadence)
  );
}

/** "07:30" for 450. */
export function formatMinuteOfDay(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
