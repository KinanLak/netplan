// How fresh a site's data is and when it is next collected (ADR 0026),
// computed against the page's clock so it ages without the query re-running.
import { formatAge, formatWhen } from "../lib/time";
import { nextRunAt } from "./cadence";
import { INTEGRATION_LABELS } from "./integrations";
import type { IntegrationKind } from "./integrations";
import type { SiteCadence } from "./settings";

const MINUTE = 60_000;

/** The cron starts a due cycle within a minute, and the cycle takes another. */
export const DUE_GRACE_MS = 2 * MINUTE;

export interface SiteFreshness {
  paused: boolean;
  hasSources: boolean;
  automaticRefresh: boolean;
  manualRefresh: boolean;
  cadence: SiteCadence;
  timezone: string;
  running: { startedAt: number; manual: boolean } | null;
  last: {
    startedAt: number;
    finishedAt: number;
    failed: Array<IntegrationKind>;
    succeeded: Array<IntegrationKind>;
  } | null;
  lastSuccessAt: number | null;
  nextRunAt: number | null;
  failures: number;
  sources: Array<{
    source: IntegrationKind;
    at: number | null;
    failed: boolean;
  }>;
  switches: { read: number; noted: number } | null;
}

/**
 * Late once two scheduled cycles have passed since the last good one, or
 * after two failures in a row. Only automatic cycles make a promise to keep.
 */
export const isLate = (freshness: SiteFreshness, now: number): boolean => {
  const { paused, hasSources, automaticRefresh, failures } = freshness;
  if (paused || !hasSources || !automaticRefresh) return false;
  if (failures >= 2) return true;
  if (freshness.lastSuccessAt === null) return false;
  const { cadence, timezone } = freshness;
  const first = nextRunAt(cadence, timezone, freshness.lastSuccessAt);
  const second = nextRunAt(cadence, timezone, first);
  return now > second + DUE_GRACE_MS;
};

export type NextRun =
  | { kind: "running" }
  | { kind: "paused" }
  | { kind: "no-source" }
  | { kind: "manual-only" }
  | { kind: "at"; at: number }
  | { kind: "imminent" }
  | { kind: "waiting" };

/** What stands in for the next cycle's date, which is never shown past. */
export const nextRun = (freshness: SiteFreshness, now: number): NextRun => {
  if (freshness.running) return { kind: "running" };
  if (freshness.paused) return { kind: "paused" };
  if (!freshness.hasSources) return { kind: "no-source" };
  if (!freshness.automaticRefresh) return { kind: "manual-only" };
  // No cycle yet: the cron starts the first one within the minute.
  const due = freshness.nextRunAt ?? now;
  if (due > now) return { kind: "at", at: due };
  return now - due < DUE_GRACE_MS ? { kind: "imminent" } : { kind: "waiting" };
};

/** `timeZone` is the reader's, pinned only by tests. */
export const describeNextRun = (
  next: NextRun,
  now: number,
  timeZone?: string,
): string => {
  switch (next.kind) {
    case "running":
      return "Collecte en cours…";
    case "paused":
      return "Collecte suspendue sur le serveur";
    case "no-source":
      return "Aucune intégration active";
    case "manual-only":
      return "Collecte automatique désactivée";
    case "at":
      return `Prochaine collecte : ${formatWhen(next.at, now, timeZone)}`;
    case "imminent":
      return "Prochaine collecte imminente";
    case "waiting":
      return "Prochaine collecte en attente";
  }
};

const listSources = (sources: Array<IntegrationKind>) =>
  sources.map((source) => INTEGRATION_LABELS[source]).join(" et ");

export type FreshnessTone = "fresh" | "partial" | "late" | "none";

/** The freshness line every user reads, and the colour of its dot. */
export const describeFreshness = (
  freshness: SiteFreshness,
  now: number,
  timeZone?: string,
): { headline: string; tone: FreshnessTone } => {
  const { lastSuccessAt } = freshness;
  if (!freshness.hasSources) {
    return { headline: "Plan dessiné à la main", tone: "none" };
  }
  const late = isLate(freshness, now);
  // Failing cycles make a site late before it ever succeeded.
  if (lastSuccessAt === null) {
    const { last } = freshness;
    // A cycle with one source read did bring data, only not all of it.
    if (last && last.succeeded.length > 0) {
      return {
        headline: `Collecte partielle ${formatAge(last.finishedAt, now, timeZone)} : ${listSources(last.failed)} en échec`,
        tone: late ? "late" : "partial",
      };
    }
    return {
      headline: "Aucune donnée collectée",
      tone: late ? "late" : "none",
    };
  }
  const age = formatAge(lastSuccessAt, now, timeZone);
  return late
    ? { headline: `Données en retard : ${age}`, tone: "late" }
    : { headline: `Données collectées ${age}`, tone: "fresh" };
};

/**
 * When the last cycle failed after the last good one: it stays said until a
 * cycle succeeds, so a failed "Actualiser" leaves a trace for everyone.
 */
export const failedAttemptAt = (freshness: SiteFreshness): number | null => {
  const { last, lastSuccessAt } = freshness;
  if (!last || last.failed.length === 0) return null;
  if (lastSuccessAt !== null && lastSuccessAt >= last.startedAt) return null;
  return last.finishedAt;
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count > 1 ? "s" : ""}`;

/** One line per source for the freshness hover card, each with its own age. */
export const describeSources = (
  freshness: SiteFreshness,
  now: number,
  timeZone?: string,
): Array<{ label: string; detail: string; failed: boolean }> =>
  freshness.sources.map(({ source, at, failed }) => {
    const age = at === null ? null : formatAge(at, now, timeZone);
    let detail: string;
    if (source === "librenms" && freshness.switches) {
      const { read, noted } = freshness.switches;
      detail = `${plural(read, "switch")} lu${read > 1 ? "s" : ""}`;
      if (noted > 0) detail += `, ${noted} avec remarque`;
      if (age) detail += ` · ${age}`;
    } else {
      detail = age ? `Importé ${age}` : "Rien d'importé";
    }
    if (failed) detail += " · échec à la dernière collecte";
    return { label: INTEGRATION_LABELS[source], detail, failed };
  });

export type RefreshOutcome =
  | { kind: "pending" }
  | { kind: "gone" }
  | { kind: "succeeded" }
  | { kind: "failed"; sources: string }
  | { kind: "interrupted" };

/**
 * How the cycle someone started at `startedAt` ended. Read only after their
 * `refresh` returned, so the query already shows that cycle running or done.
 */
export const refreshOutcome = (
  freshness: SiteFreshness | null,
  startedAt: number,
): RefreshOutcome => {
  if (!freshness) return { kind: "gone" };
  if (freshness.running?.startedAt === startedAt) return { kind: "pending" };
  if (freshness.last?.startedAt !== startedAt) return { kind: "interrupted" };
  return freshness.last.failed.length === 0
    ? { kind: "succeeded" }
    : { kind: "failed", sources: listSources(freshness.last.failed) };
};
