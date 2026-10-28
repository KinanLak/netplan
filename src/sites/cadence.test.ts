import { describe, expect, it } from "bun:test";
import { nextRunAt, retryAt } from "./cadence";
import { DEFAULT_INTERVAL_MINUTES } from "./settings";

const MINUTE = 60_000;
const at = (iso: string) => Date.parse(iso);

describe("site cadence", () => {
  it("runs every 5 minutes by default, day and night, weekdays and weekends", () => {
    for (const iso of [
      "2026-06-16T08:00:00Z", // Tuesday morning in Paris
      "2026-06-16T21:00:00Z", // Tuesday night
      "2026-06-20T10:00:00Z", // Saturday
    ]) {
      expect(nextRunAt(DEFAULT_INTERVAL_MINUTES, at(iso)) - at(iso)).toBe(
        5 * MINUTE,
      );
    }
  });

  it("backs off after failures, never sooner than the interval", () => {
    const from = at("2026-06-16T08:00:00Z");
    const retry = (interval: number, failures: number) =>
      (retryAt(interval, from, failures) - from) / MINUTE;
    expect([1, 2, 3, 4, 5, 6, 10].map((n) => retry(5, n))).toEqual([
      5, 10, 20, 40, 80, 120, 120,
    ]);
    expect(retry(60, 2)).toBe(60);
  });
});
