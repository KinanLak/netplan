// A device's snapshots read as runs: the same MAC at the same place on
// consecutive snapshots is one row, « 18 → 20 oct., 7 relevés » (A61).
import type { SnapshotEntry } from "@/history/HistoryLists";

export type SnapshotRun = {
  /** The run's newest entry, whose place it shows. */
  newest: SnapshotEntry;
  oldestAt: number;
  count: number;
};

/** Same MAC, same port and socket, and the same names as captured then. */
const samePlace = (a: SnapshotEntry, b: SnapshotEntry) =>
  a.mac === b.mac &&
  a.place.portId === b.place.portId &&
  a.place.socketId === b.place.socketId &&
  a.place.switchName === b.place.switchName &&
  a.place.portName === b.place.portName &&
  a.place.socketName === b.place.socketName &&
  a.place.floorName === b.place.floorName &&
  a.place.buildingName === b.place.buildingName;

/**
 * Entries newest first, folded into runs of the same MAC and place. A
 * device's MACs come interleaved, so each MAC keeps its own open run; a
 * renamed socket or floor starts a new one, keeping the names of the time.
 */
export const snapshotRuns = (
  entries: ReadonlyArray<SnapshotEntry>,
): Array<SnapshotRun> => {
  const runs: Array<SnapshotRun> = [];
  const open = new Map<string, SnapshotRun>();
  for (const entry of entries) {
    const run = open.get(entry.mac);
    if (run && samePlace(run.newest, entry)) {
      run.oldestAt = entry.slotAt;
      run.count += 1;
    } else {
      const next = { newest: entry, oldestAt: entry.slotAt, count: 1 };
      runs.push(next);
      open.set(entry.mac, next);
    }
  }
  return runs;
};
