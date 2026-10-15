import { describe, expect, it } from "bun:test";
import {
  DEFAULT_CADENCE,
  DEFAULT_TIMEZONE,
  cadenceError,
  formatMinuteOfDay,
  isTimeZone,
  parseMinuteOfDay,
  siteSettingsError,
} from "./settings";

const settings = {
  name: "Arles",
  timezone: DEFAULT_TIMEZONE,
  cadence: DEFAULT_CADENCE,
  automaticRefresh: true,
  manualRefresh: true,
};

describe("site settings", () => {
  it("accepts the defaults", () => {
    expect(siteSettingsError(settings)).toBeNull();
  });

  it("refuses a blank name and an unknown time zone", () => {
    expect(siteSettingsError({ ...settings, name: "  " })).toMatch(/nom/);
    expect(
      siteSettingsError({ ...settings, timezone: "Europe/Atlantis" }),
    ).toMatch(/fuseau/);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone("America/Montreal")).toBe(true);
  });

  it("keeps cycles at least five minutes apart", () => {
    expect(
      cadenceError({ ...DEFAULT_CADENCE, businessIntervalMinutes: 4 }),
    ).toMatch(/intervalle/);
    expect(
      cadenceError({ ...DEFAULT_CADENCE, otherIntervalMinutes: 2.5 }),
    ).toMatch(/intervalle/);
  });

  it("needs business hours that start before they end, on real weekdays", () => {
    expect(
      cadenceError({
        ...DEFAULT_CADENCE,
        businessStartMinute: 20 * 60,
        businessEndMinute: 7 * 60,
      }),
    ).toMatch(/heures/);
    expect(cadenceError({ ...DEFAULT_CADENCE, businessDays: [1, 1] })).toMatch(
      /jours/,
    );
    expect(cadenceError({ ...DEFAULT_CADENCE, businessDays: [0] })).toMatch(
      /jours/,
    );
    expect(cadenceError({ ...DEFAULT_CADENCE, businessDays: [] })).toBeNull();
  });

  it("reads and writes times of day", () => {
    expect(formatMinuteOfDay(450)).toBe("07:30");
    expect(parseMinuteOfDay("7:30")).toBe(450);
    expect(parseMinuteOfDay("24:00")).toBe(1440);
    expect(parseMinuteOfDay("24:01")).toBeNull();
    expect(parseMinuteOfDay("12:60")).toBeNull();
    expect(parseMinuteOfDay("midi")).toBeNull();
  });
});
