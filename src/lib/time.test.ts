import { describe, expect, it } from "bun:test";
import {
  ageHint,
  formatAge,
  formatDateTime,
  formatTime,
  formatWhen,
  timeZoneHint,
} from "./time";

const MINUTE = 60_000;
// Wednesday 21 October 2026, 12:05 UTC: 14:05 in Paris, 08:05 in New York.
const AT = Date.parse("2026-10-21T12:05:00Z");

describe("formatting in the reader's zone", () => {
  it("shows the same instant on each reader's own 24-hour clock", () => {
    expect(formatTime(AT, "Europe/Paris")).toBe("14:05");
    expect(formatTime(AT, "America/New_York")).toBe("08:05");
    expect(formatTime(Date.parse("2026-10-21T21:30:00Z"), "UTC")).toBe("21:30");
  });

  it("names the day, and the year only when it is not this one", () => {
    expect(formatDateTime(AT, AT, "Europe/Paris")).toMatch(
      /^mer\. 21 oct\.,? 14:05$/,
    );
    expect(
      formatDateTime(AT, Date.parse("2027-01-02T10:00:00Z"), "Europe/Paris"),
    ).toMatch(/^mer\. 21 oct\. 2026,? 14:05$/);
  });

  it("drops the day of a time today, by the reader's calendar", () => {
    const evening = Date.parse("2026-10-21T22:30:00Z");
    // 00:30 the next day in Paris, still the 21st in New York.
    expect(formatWhen(evening, AT, "America/New_York")).toBe("18:30");
    expect(formatWhen(evening, AT, "Europe/Paris")).toMatch(
      /^jeu\. 22 oct\.,? 00:30$/,
    );
  });

  it("ages a time in words, then falls back to its date", () => {
    expect(formatAge(AT, AT + 30_000, "Europe/Paris")).toBe("à l'instant");
    expect(formatAge(AT, AT + 4 * MINUTE, "Europe/Paris")).toBe("il y a 4 min");
    expect(formatAge(AT, AT + 150 * MINUTE, "Europe/Paris")).toBe("il y a 2 h");
    expect(formatAge(AT, AT + 48 * 60 * MINUTE, "Europe/Paris")).toMatch(
      /^le mer\. 21 oct\.,? 14:05$/,
    );
  });
});

describe("timeZoneHint", () => {
  it("names the zone and its offset at that instant", () => {
    expect(timeZoneHint(AT, "Europe/Paris")).toBe("Europe/Paris • UTC+2");
    expect(
      timeZoneHint(Date.parse("2026-12-01T12:00:00Z"), "Europe/Paris"),
    ).toBe("Europe/Paris • UTC+1");
    expect(timeZoneHint(AT, "Asia/Kolkata")).toBe("Asia/Kolkata • UTC+5:30");
    expect(timeZoneHint(AT, "UTC")).toBe("UTC");
  });

  it("says when a relative time was, and where", () => {
    expect(ageHint(AT, AT, "Europe/Paris")).toMatch(
      /^mer\. 21 oct\.,? 14:05 · Europe\/Paris • UTC\+2$/,
    );
  });
});
