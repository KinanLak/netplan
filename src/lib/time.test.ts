import { describe, expect, it } from "bun:test";
import {
  ageHint,
  dayOf,
  displayLocale,
  formatDay,
  isCalendarDay,
  nextDay,
  startOfDay,
  formatAge,
  formatDateTime,
  formatTime,
  formatWhen,
  timeZoneHint,
} from "./time";

const MINUTE = 60_000;
// Wednesday 21 October 2026, 12:05 UTC: 14:05 in Paris, 08:05 in New York.
const AT = Date.parse("2026-10-21T12:05:00Z");

// The test preload pins French; these read another browser's locale.
const inLocale = <T>(locale: string, read: () => T): T => {
  const pinned = displayLocale.current;
  displayLocale.current = locale;
  try {
    return read();
  } finally {
    displayLocale.current = pinned;
  }
};

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

describe("the browser's locale", () => {
  it("writes dates as the browser does, on a 24-hour clock", () => {
    expect(
      inLocale("en-US", () => formatDateTime(AT, AT, "Europe/Paris")),
    ).toBe("Wed, Oct 21, 14:05");
    expect(
      inLocale("en-US", () =>
        formatTime(Date.parse("2026-10-21T22:05:00Z"), "UTC"),
      ),
    ).toBe("22:05");
    expect(
      inLocale("en-US", () =>
        formatDay(AT - 2 * 24 * 60 * MINUTE, AT, "Europe/Paris"),
      ),
    ).toBe("Monday, October 19");
  });

  it("keeps relative words French with the interface", () => {
    expect(inLocale("en-US", () => formatDay(AT, AT, "Europe/Paris"))).toBe(
      "Aujourd'hui",
    );
    expect(
      inLocale("en-US", () => formatAge(AT, AT + 4 * MINUTE, "Europe/Paris")),
    ).toBe("il y a 4 min");
  });
});

describe("timeZoneHint", () => {
  it("names the zone and its offset at that instant", () => {
    expect(timeZoneHint(AT, "Europe/Paris")).toBe("Europe/Paris (UTC+2)");
    expect(
      timeZoneHint(Date.parse("2026-12-01T12:00:00Z"), "Europe/Paris"),
    ).toBe("Europe/Paris (UTC+1)");
    expect(timeZoneHint(AT, "Asia/Kolkata")).toBe("Asia/Kolkata (UTC+5:30)");
    expect(timeZoneHint(AT, "UTC")).toBe("UTC");
  });

  it("says when a relative time was, and where", () => {
    expect(ageHint(AT, AT, "Europe/Paris")).toMatch(
      /^mer\. 21 oct\.,? 14:05\nEurope\/Paris \(UTC\+2\)$/,
    );
  });
});

describe("days", () => {
  it("names a day as the reader's calendar does", () => {
    expect(dayOf(Date.parse("2026-10-21T22:30:00Z"), "Europe/Paris")).toBe(
      "2026-10-22",
    );
    expect(formatDay(AT, AT, "Europe/Paris")).toBe("Aujourd'hui");
    expect(formatDay(AT - 24 * 60 * MINUTE, AT, "Europe/Paris")).toBe("Hier");
    expect(formatDay(AT - 2 * 24 * 60 * MINUTE, AT, "Europe/Paris")).toBe(
      "Lundi 19 octobre",
    );
  });

  it("starts a day at the reader's midnight, across a change of offset", () => {
    expect(startOfDay("2026-10-21", "Europe/Paris")).toBe(
      Date.parse("2026-10-20T22:00:00Z"),
    );
    // Paris leaves summer time at 03:00 on 25 October.
    expect(startOfDay("2026-10-26", "Europe/Paris")).toBe(
      Date.parse("2026-10-25T23:00:00Z"),
    );
    expect(startOfDay("2026-10-21", "America/Sao_Paulo")).toBe(
      Date.parse("2026-10-21T03:00:00Z"),
    );
    // Santiago skips from 23:59 to 01:00 on 6 September 2026.
    expect(startOfDay("2026-09-06", "America/Santiago")).toBe(
      Date.parse("2026-09-06T04:00:00Z"),
    );
    expect(startOfDay(nextDay("2026-09-05"), "America/Santiago")).toBe(
      Date.parse("2026-09-06T04:00:00Z"),
    );
  });

  it("says « Hier » by the calendar, even after a short night", () => {
    // 00:30 on 30 March in Paris, the night after the clocks went forward.
    const now = Date.parse("2026-03-29T22:30:00Z");
    expect(
      formatDay(Date.parse("2026-03-29T10:00:00Z"), now, "Europe/Paris"),
    ).toBe("Hier");
    expect(
      formatDay(Date.parse("2026-03-28T22:00:00Z"), now, "Europe/Paris"),
    ).not.toBe("Hier");
  });

  it("accepts only real calendar days", () => {
    expect(isCalendarDay("2026-10-21")).toBe(true);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("21/10/2026")).toBe(false);
  });
});
