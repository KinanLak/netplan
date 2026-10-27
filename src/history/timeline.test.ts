import { describe, expect, it } from "bun:test";
import type { HistoryEvent } from "./HistoryLists";
import { timeline } from "./timeline";

const place = {
  switchId: "device:sw",
  switchName: "sw",
  portId: "port:1",
  portName: "Gi1/0/1",
};

const event = (
  kind: HistoryEvent["kind"],
  at: string,
  deviceId = "device:pc",
): HistoryEvent => ({
  siteId: "site:a",
  deviceId,
  deviceName: deviceId,
  at: Date.parse(at),
  kind,
  ...(kind === "located" && { place }),
});

describe("timeline", () => {
  it("reads an arrival's place and « En ligne » at the same second as one row", () => {
    const [day] = timeline(
      [
        event("online", "2026-10-21T10:00:00Z"),
        event("located", "2026-10-21T10:00:00Z"),
        event("offline", "2026-10-21T08:00:00Z"),
      ],
      "Europe/Paris",
    );
    expect(
      day.rows.map(({ event: { kind }, cameOnline }) => [kind, cameOnline]),
    ).toEqual([
      ["located", true],
      ["offline", false],
    ]);
  });

  it("merges an arrival whose two events other devices' events separate", () => {
    const [day] = timeline(
      [
        event("online", "2026-10-21T10:00:00Z", "device:a"),
        event("online", "2026-10-21T10:00:00Z", "device:b"),
        event("located", "2026-10-21T10:00:00Z", "device:a"),
        event("located", "2026-10-21T10:00:00Z", "device:b"),
      ],
      "Europe/Paris",
    );
    expect(
      day.rows.map(({ event: { deviceId, kind }, cameOnline }) => [
        deviceId,
        kind,
        cameOnline,
      ]),
    ).toEqual([
      ["device:a", "located", true],
      ["device:b", "located", true],
    ]);
  });

  it("keeps apart what only looks alike: another device, another second", () => {
    const [day] = timeline(
      [
        event("online", "2026-10-21T10:00:00Z", "device:a"),
        event("located", "2026-10-21T10:00:00Z", "device:b"),
        event("located", "2026-10-21T09:00:00Z"),
      ],
      "Europe/Paris",
    );
    expect(day.rows.every(({ cameOnline }) => !cameOnline)).toBe(true);
  });

  it("groups rows under the reader's days, newest first", () => {
    const days = timeline(
      [
        event("online", "2026-10-21T22:30:00Z"),
        event("offline", "2026-10-21T21:30:00Z"),
        event("online", "2026-10-20T10:00:00Z"),
      ],
      "Europe/Paris",
    );
    expect(days.map(({ day, rows }) => [day, rows.length])).toEqual([
      ["2026-10-22", 1],
      ["2026-10-21", 1],
      ["2026-10-20", 1],
    ]);
  });
});
