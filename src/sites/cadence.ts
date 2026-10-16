// When a site's next collection cycle runs (ADR 0010, ADR 0023). Imported by
// `convex/`, so relative imports only.
import type { SiteCadence } from "./settings";

const MINUTE = 60_000;

const WEEKDAY_NUMBERS: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/** The ISO weekday and minute of the day an instant shows in a time zone. */
const wallClock = (timezone: string) => {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (at: number) => {
    const parts = Object.fromEntries(
      format.formatToParts(at).map((part) => [part.type, part.value]),
    );
    return {
      weekday: WEEKDAY_NUMBERS[parts.weekday] ?? 0,
      minute: Number(parts.hour) * 60 + Number(parts.minute),
    };
  };
};

const inBusinessHours = (
  cadence: SiteCadence,
  clock: { weekday: number; minute: number },
) =>
  cadence.businessDays.includes(clock.weekday) &&
  clock.minute >= cadence.businessStartMinute &&
  clock.minute < cadence.businessEndMinute;

/** Whether `at` falls in the site's business hours, in its time zone. */
export const isBusinessTime = (
  cadence: SiteCadence,
  timezone: string,
  at: number,
): boolean => inBusinessHours(cadence, wallClock(timezone)(at));

/**
 * The next cycle after one that started at `from`: the business interval in
 * business hours, the other one otherwise, ending early when business hours
 * start in the meantime, so Monday's first cycle is at opening time.
 */
export const nextRunAt = (
  cadence: SiteCadence,
  timezone: string,
  from: number,
): number => {
  const clock = wallClock(timezone);
  if (inBusinessHours(cadence, clock(from))) {
    return from + cadence.businessIntervalMinutes * MINUTE;
  }
  const end = from + cadence.otherIntervalMinutes * MINUTE;
  // Minute by minute, so a daylight-saving change needs no special case.
  for (
    let at = Math.floor(from / MINUTE) * MINUTE + MINUTE;
    at < end;
    at += MINUTE
  ) {
    if (inBusinessHours(cadence, clock(at))) return at;
  }
  return end;
};

const FIRST_RETRY_MINUTES = 5;
const MAX_RETRY_MINUTES = 120;

/**
 * The next cycle after `failures` failed ones in a row, the last started at
 * `from`: never sooner than the cadence, and backing off from 5 minutes to
 * 2 hours so a source that is down is not asked every few minutes.
 */
export const retryAt = (
  cadence: SiteCadence,
  timezone: string,
  from: number,
  failures: number,
): number => {
  const backoff = Math.min(
    FIRST_RETRY_MINUTES * 2 ** Math.max(failures - 1, 0),
    MAX_RETRY_MINUTES,
  );
  return Math.max(nextRunAt(cadence, timezone, from), from + backoff * MINUTE);
};
