import { describe, expect, it } from "bun:test";
import {
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_TIMEZONE,
  intervalError,
  isTimeZone,
  siteSettingsError,
  siteSettingsProblem,
} from "./settings";

const settings = {
  name: "Arles",
  timezone: DEFAULT_TIMEZONE,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
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

  it("names the field each problem belongs to", () => {
    expect(siteSettingsProblem({ ...settings, name: "" })?.field).toBe("name");
    expect(siteSettingsProblem({ ...settings, intervalMinutes: 2 })).toEqual({
      field: "intervalMinutes",
      message: "L'intervalle va de 5 à 1\u202f440 minutes.",
    });
  });

  it("keeps cycles at least five minutes apart, and whole minutes", () => {
    expect(intervalError(4)).toMatch(/intervalle/);
    expect(intervalError(7.5)).toMatch(/intervalle/);
    expect(intervalError(24 * 60 + 1)).toMatch(/intervalle/);
    expect(intervalError(5)).toBeNull();
    expect(intervalError(24 * 60)).toBeNull();
  });
});
