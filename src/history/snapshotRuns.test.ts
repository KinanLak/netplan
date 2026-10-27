import { describe, expect, it } from "bun:test";
import type { SnapshotEntry } from "./HistoryLists";
import { snapshotRuns } from "./snapshotRuns";

const entry = (
  slotAt: number,
  portId: string,
  mac = "02:6e:70:00:01:05",
): SnapshotEntry => ({
  slotAt,
  mac,
  place: { switchId: "device:sw", switchName: "sw", portId, portName: portId },
});

describe("snapshotRuns", () => {
  it("folds the same MAC at the same place into one run, and breaks on a move", () => {
    const runs = snapshotRuns([
      entry(5, "port:2"),
      entry(4, "port:1"),
      entry(3, "port:1"),
      entry(2, "port:1"),
      entry(1, "port:2"),
    ]);
    expect(
      runs.map(({ newest, oldestAt, count }) => [
        newest.place.portId,
        newest.slotAt,
        oldestAt,
        count,
      ]),
    ).toEqual([
      ["port:2", 5, 5, 1],
      ["port:1", 4, 2, 3],
      ["port:2", 1, 1, 1],
    ]);
  });

  it("keeps two MACs of one device apart, even at one place", () => {
    const runs = snapshotRuns([
      entry(2, "port:1", "aa:aa:aa:aa:aa:01"),
      entry(2, "port:1", "aa:aa:aa:aa:aa:02"),
    ]);
    expect(runs).toHaveLength(2);
  });

  it("folds each MAC of a device on its own, though they come interleaved", () => {
    const a = "aa:aa:aa:aa:aa:01";
    const b = "aa:aa:aa:aa:aa:02";
    const runs = snapshotRuns([
      entry(3, "port:1", a),
      entry(3, "port:2", b),
      entry(2, "port:1", a),
      entry(2, "port:2", b),
      entry(1, "port:1", a),
    ]);
    expect(runs.map(({ newest, count }) => [newest.mac, count])).toEqual([
      [a, 3],
      [b, 2],
    ]);
  });

  it("starts a new run when the place's names changed, keeping each one's", () => {
    const renamed = {
      ...entry(2, "port:1"),
      place: { ...entry(2, "port:1").place, socketName: "Prise B-06" },
    };
    const runs = snapshotRuns([renamed, entry(1, "port:1")]);
    expect(runs.map(({ newest }) => newest.place.socketName)).toEqual([
      "Prise B-06",
      undefined,
    ]);
  });
});
