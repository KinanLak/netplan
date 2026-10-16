import { describe, expect, it } from "bun:test";
import { isBusinessTime, nextRunAt, retryAt } from "./cadence";
import { DEFAULT_CADENCE } from "./settings";

const PARIS = "Europe/Paris";
const MINUTE = 60_000;
const at = (iso: string) => Date.parse(iso);

describe("site cadence", () => {
  it("runs every 5 minutes in business hours, in the site's time zone", () => {
    // Tuesday 10:00 in Paris (UTC+2 in summer).
    const tuesday = at("2026-06-16T08:00:00Z");
    expect(isBusinessTime(DEFAULT_CADENCE, PARIS, tuesday)).toBe(true);
    expect(nextRunAt(DEFAULT_CADENCE, PARIS, tuesday)).toBe(
      tuesday + 5 * MINUTE,
    );
    // The same instant is 04:00 in New York.
    expect(isBusinessTime(DEFAULT_CADENCE, "America/New_York", tuesday)).toBe(
      false,
    );
  });

  it("runs hourly at night and at weekends", () => {
    const night = at("2026-06-16T21:00:00Z"); // 23:00 in Paris
    expect(nextRunAt(DEFAULT_CADENCE, PARIS, night)).toBe(night + 60 * MINUTE);
    const saturday = at("2026-06-20T10:00:00Z");
    expect(isBusinessTime(DEFAULT_CADENCE, PARIS, saturday)).toBe(false);
    expect(nextRunAt(DEFAULT_CADENCE, PARIS, saturday)).toBe(
      saturday + 60 * MINUTE,
    );
  });

  it("ends an hourly wait at opening time", () => {
    // Monday 06:40 in Paris: the next cycle is at 07:00, not 07:40.
    const early = at("2026-06-15T04:40:00Z");
    expect(nextRunAt(DEFAULT_CADENCE, PARIS, early)).toBe(
      at("2026-06-15T05:00:00Z"),
    );
    // Friday 19:58: still business hours, then hourly from 20:03.
    const closing = at("2026-06-19T17:58:00Z");
    expect(nextRunAt(DEFAULT_CADENCE, PARIS, closing)).toBe(
      closing + 5 * MINUTE,
    );
  });

  it("follows the clock across a daylight-saving change", () => {
    // Monday 30 March 2026, the day after the change: 07:00 is 05:00 UTC.
    const before = at("2026-03-30T04:30:00Z"); // 06:30 in Paris
    expect(nextRunAt(DEFAULT_CADENCE, PARIS, before)).toBe(
      at("2026-03-30T05:00:00Z"),
    );
    // A week earlier, in winter, 07:00 was 06:00 UTC.
    const winter = at("2026-03-23T05:30:00Z"); // 06:30 in Paris
    expect(nextRunAt(DEFAULT_CADENCE, PARIS, winter)).toBe(
      at("2026-03-23T06:00:00Z"),
    );
  });

  it("backs off after failures, never sooner than the cadence", () => {
    const tuesday = at("2026-06-16T08:00:00Z");
    const retry = (failures: number) =>
      (retryAt(DEFAULT_CADENCE, PARIS, tuesday, failures) - tuesday) / MINUTE;
    expect([1, 2, 3, 4, 5, 6, 10].map(retry)).toEqual([
      5, 10, 20, 40, 80, 120, 120,
    ]);
    const night = at("2026-06-16T21:00:00Z");
    expect((retryAt(DEFAULT_CADENCE, PARIS, night, 2) - night) / MINUTE).toBe(
      60,
    );
  });
});
