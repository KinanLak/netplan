// When a site's next collection cycle runs: one interval, day and night
// alike (ADR 0038). Imported by `convex/`, so relative imports only.

const MINUTE = 60_000;

/** The next cycle after one that started at `from`. */
export const nextRunAt = (intervalMinutes: number, from: number): number =>
  from + intervalMinutes * MINUTE;

const FIRST_RETRY_MINUTES = 5;
const MAX_RETRY_MINUTES = 120;

/**
 * The next cycle after `failures` failed ones in a row, the last started at
 * `from`: never sooner than the interval, and backing off from 5 minutes to
 * 2 hours so a source that is down is not asked every few minutes.
 */
export const retryAt = (
  intervalMinutes: number,
  from: number,
  failures: number,
): number => {
  const backoff = Math.min(
    FIRST_RETRY_MINUTES * 2 ** Math.max(failures - 1, 0),
    MAX_RETRY_MINUTES,
  );
  return Math.max(nextRunAt(intervalMinutes, from), from + backoff * MINUTE);
};
