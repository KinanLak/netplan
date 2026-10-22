import { describe, expect, it } from "bun:test";
import { carries, statusFrom, withObservation } from "./statuses";

const seen = {
  "aa:00:00:00:00:01": { misses: 0, switchId: "device:sw-a", seenAt: 2_000 },
  "aa:00:00:00:00:02": { misses: 5, switchId: "device:sw-b", seenAt: 1_000 },
} as const;
const seenOn = (mac: string) => seen[mac as keyof typeof seen];
const macs = Object.keys(seen);

describe("statusFrom", () => {
  it("says online or offline while a fresh read vouches for a MAC", () => {
    expect(statusFrom(macs, seenOn, new Set(["device:sw-a"]))).toEqual({
      status: "up",
    });
    expect(statusFrom(macs, seenOn, new Set(["device:sw-b"]))).toEqual({
      status: "down",
    });
  });

  it("says when it was last seen once no read vouches for it", () => {
    expect(statusFrom(macs, seenOn, new Set())).toEqual({
      status: "stale",
      lastSeenAt: 2_000,
    });
  });

  it("says nothing of a device never seen", () => {
    expect(statusFrom(["aa:00:00:00:00:09"], seenOn, new Set())).toBe(
      undefined,
    );
  });
});

describe("withObservation", () => {
  it("keeps the time only with a stale status, and the rest of the metadata", () => {
    const stale = withObservation(
      { lastUser: "c.martin", status: "up" },
      { status: "stale", lastSeenAt: 2_000 },
    );
    expect(stale).toEqual({
      lastUser: "c.martin",
      status: "stale",
      lastSeenAt: 2_000,
    });
    expect(withObservation(stale, { status: "up" })).toEqual({
      lastUser: "c.martin",
      status: "up",
    });
    expect(withObservation(stale, undefined)).toEqual({ lastUser: "c.martin" });
    expect(carries(stale, { status: "stale", lastSeenAt: 2_000 })).toBe(true);
    expect(carries(stale, { status: "stale", lastSeenAt: 3_000 })).toBe(false);
    expect(carries({}, undefined)).toBe(true);
  });
});
