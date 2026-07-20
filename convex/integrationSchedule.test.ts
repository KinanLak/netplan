import { describe, expect, it } from "bun:test";
import {
  franceMetropolitanHolidayKeys,
  localizationBackoffMs,
  nextAfterFailure,
  nextNetBoxAttempt,
  nextNominalAttempt,
} from "./integrationSchedule";

const schedule = {
  timezone: "Europe/Paris",
  dayStartMinute: 7 * 60,
  dayEndMinute: 20 * 60,
};
const at = (iso: string) => Date.parse(iso);

describe("integration schedule", () => {
  it("uses five minutes during a working day", () => {
    expect(nextNominalAttempt(at("2026-07-17T08:00:00Z"), schedule)).toBe(
      at("2026-07-17T08:05:00Z"),
    );
  });

  it("uses one hour at night and on weekends and holidays", () => {
    expect(nextNominalAttempt(at("2026-07-17T20:00:00Z"), schedule)).toBe(
      at("2026-07-17T21:00:00Z"),
    );
    expect(nextNominalAttempt(at("2026-07-18T08:00:00Z"), schedule)).toBe(
      at("2026-07-18T09:00:00Z"),
    );
    expect(nextNominalAttempt(at("2026-07-14T08:00:00Z"), schedule)).toBe(
      at("2026-07-14T09:00:00Z"),
    );
  });

  it("does not cross the day-range transitions", () => {
    expect(nextNominalAttempt(at("2026-07-17T04:58:00Z"), schedule)).toBe(
      at("2026-07-17T05:00:00Z"),
    );
    expect(nextNominalAttempt(at("2026-07-17T17:58:00Z"), schedule)).toBe(
      at("2026-07-17T18:00:00Z"),
    );
  });

  it("contains fixed and movable metropolitan France holidays", () => {
    const holidays = franceMetropolitanHolidayKeys(2026);
    expect(holidays.has("2026-01-01")).toBe(true);
    expect(holidays.has("2026-04-06")).toBe(true);
    expect(holidays.has("2026-05-14")).toBe(true);
    expect(holidays.has("2026-05-25")).toBe(true);
    expect(holidays.has("2026-12-25")).toBe(true);
  });

  it("skips the duplicated local hour during the autumn DST change", () => {
    expect(nextNominalAttempt(at("2026-10-25T00:30:00Z"), schedule)).toBe(
      at("2026-10-25T02:30:00Z"),
    );
  });

  it("keeps NetBox cadence and localization backoff independent", () => {
    const start = at("2026-07-17T08:00:00Z");
    expect(nextNetBoxAttempt(start)).toBe(start + 15 * 60 * 1000);
    expect([1, 2, 3, 4, 5].map(localizationBackoffMs)).toEqual(
      [4, 8, 16, 30, 30].map((minutes) => minutes * 60 * 1000),
    );
    expect(nextAfterFailure(start + 60 * 60 * 1000, start, 1)).toBe(
      start + 60 * 60 * 1000,
    );
  });
});
