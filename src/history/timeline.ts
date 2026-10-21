// How a list of history events reads: an arrival's two rows as one, and the
// rows under the reader's days (B21). Display only: the events stay as the
// cycle wrote them.
import { dayOf } from "@/lib/time";
import type { HistoryEvent } from "@/history/HistoryLists";

export type TimelineRow = {
  event: HistoryEvent;
  /** A `located` event whose device came online at the same instant. */
  cameOnline: boolean;
};

export type TimelineDay = { day: string; at: number; rows: Array<TimelineRow> };

const sameArrival = (a: HistoryEvent, b: HistoryEvent) =>
  a.deviceId === b.deviceId &&
  a.at === b.at &&
  new Set([a.kind, b.kind]).size === 2 &&
  [a.kind, b.kind].includes("located") &&
  [a.kind, b.kind].includes("online");

/** Events newest first, grouped by the reader's day, arrivals merged. */
export const timeline = (
  events: ReadonlyArray<HistoryEvent>,
  timeZone?: string,
): Array<TimelineDay> => {
  const rows: Array<TimelineRow> = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const next = index + 1 < events.length ? events[index + 1] : undefined;
    if (next !== undefined && sameArrival(event, next)) {
      const located = event.kind === "located" ? event : next;
      rows.push({ event: located, cameOnline: true });
      index += 1;
    } else {
      rows.push({ event, cameOnline: false });
    }
  }
  const days: Array<TimelineDay> = [];
  for (const row of rows) {
    const day = dayOf(row.event.at, timeZone);
    const last = days.at(-1);
    if (last?.day === day) last.rows.push(row);
    else days.push({ day, at: row.event.at, rows: [row] });
  }
  return days;
};
