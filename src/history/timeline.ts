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

const key = (event: HistoryEvent) => `${event.deviceId}|${event.at}`;

/**
 * Events newest first, grouped by the reader's day, arrivals merged. A cycle
 * writes every location before any presence, so an arrival's two events may
 * lie apart, with other devices' events between them.
 */
export const timeline = (
  events: ReadonlyArray<HistoryEvent>,
  timeZone?: string,
): Array<TimelineDay> => {
  const located = new Set(
    events.filter(({ kind }) => kind === "located").map(key),
  );
  const cameOnline = new Set(
    events
      .filter(({ kind }) => kind === "online")
      .map(key)
      .filter((arrival) => located.has(arrival)),
  );
  const rows: Array<TimelineRow> = events.flatMap((event) => {
    if (event.kind === "online" && cameOnline.has(key(event))) return [];
    return [
      {
        event,
        cameOnline: event.kind === "located" && cameOnline.has(key(event)),
      },
    ];
  });
  const days: Array<TimelineDay> = [];
  for (const row of rows) {
    const day = dayOf(row.event.at, timeZone);
    const last = days.at(-1);
    if (last?.day === day) last.rows.push(row);
    else days.push({ day, at: row.event.at, rows: [row] });
  }
  return days;
};
