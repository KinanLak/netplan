import { describe, expect, it } from "bun:test";
import { siteDay, slotAt, slotStillOpen } from "./snapshots";

const PARIS = "Europe/Paris";
const at = (iso: string) => Date.parse(iso);

describe("snapshot slots", () => {
  it("is taken from five minutes before to ten minutes after its time, in the site's time zone", () => {
    // 14:00 in Paris is 12:00 UTC in summer.
    const slot = {
      day: "2026-06-16",
      time: "14:00",
      at: at("2026-06-16T12:00:00Z"),
    };
    expect(slotAt(PARIS, at("2026-06-16T11:55:00Z"))).toEqual(slot);
    expect(slotAt(PARIS, at("2026-06-16T12:09:59Z"))).toEqual(slot);
    expect(slotAt(PARIS, at("2026-06-16T11:54:59Z"))).toBeNull();
    expect(slotAt(PARIS, at("2026-06-16T12:10:00Z"))).toBeNull();
    // The same instant is 08:00 in New York.
    expect(slotAt("America/New_York", at("2026-06-16T12:03:00Z"))).toEqual({
      day: "2026-06-16",
      time: "08:00",
      at: at("2026-06-16T12:00:00Z"),
    });
  });

  it("follows the site's winter offset and its calendar day", () => {
    // 08:00 in Paris is 07:00 UTC in winter.
    expect(slotAt(PARIS, at("2026-12-01T07:02:00Z"))?.at).toBe(
      at("2026-12-01T07:00:00Z"),
    );
    // 19:00 in Tokyo is 10:00 UTC the same day; 08:00 is the previous evening in UTC.
    expect(slotAt("Asia/Tokyo", at("2026-06-15T23:00:00Z"))).toEqual({
      day: "2026-06-16",
      time: "08:00",
      at: at("2026-06-15T23:00:00Z"),
    });
  });

  it("leaves a slot open until its window closes, in the site's day", () => {
    const at14h09 = at("2026-06-16T12:09:00Z");
    expect(slotStillOpen(PARIS, "2026-06-16", "14:00", at14h09)).toBe(true);
    expect(slotStillOpen(PARIS, "2026-06-16", "14:00", at14h09 + 60_000)).toBe(
      false,
    );
    expect(slotStillOpen(PARIS, "2026-06-17", "08:00", at14h09)).toBe(true);
    expect(slotStillOpen(PARIS, "2026-06-15", "19:00", at14h09)).toBe(false);
    // 23:30 UTC is already the next day in Paris.
    expect(siteDay(PARIS, at("2026-06-16T23:30:00Z"))).toBe("2026-06-17");
  });
});
