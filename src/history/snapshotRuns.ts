// A device's snapshots read as runs: the same MAC at the same place on
// consecutive snapshots is one row, « 18 → 20 oct., 7 relevés » (A61).
import type { SnapshotEntry } from "@/history/HistoryLists";

export type SnapshotRun = {
  /** The run's newest entry, whose place it shows. */
  newest: SnapshotEntry;
  oldestAt: number;
  count: number;
};

const samePlace = (a: SnapshotEntry, b: SnapshotEntry) =>
  a.mac === b.mac &&
  a.place.portId === b.place.portId &&
  a.place.socketId === b.place.socketId;

/** Entries newest first, folded into runs of the same MAC and place. */
export const snapshotRuns = (
  entries: ReadonlyArray<SnapshotEntry>,
): Array<SnapshotRun> => {
  const runs: Array<SnapshotRun> = [];
  for (const entry of entries) {
    const last = runs.at(-1);
    if (last && samePlace(last.newest, entry)) {
      last.oldestAt = entry.slotAt;
      last.count += 1;
    } else {
      runs.push({ newest: entry, oldestAt: entry.slotAt, count: 1 });
    }
  }
  return runs;
};
