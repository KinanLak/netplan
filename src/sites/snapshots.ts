// The five daily MAC snapshots (ADR 0027). Imported by `convex/`, so relative
// imports only.

const MINUTE = 60_000;

/** The snapshot times of a day, in the site's time zone. */
export const SNAPSHOT_TIMES = ["08:00", "12:00", "14:00", "16:00", "19:00"];

/** A slot is taken by a cycle up to five minutes early or ten minutes late. */
const EARLY_MINUTES = 5;
const LATE_MINUTES = 10;

const minuteOf = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

/** The day and minute of the day an instant shows in a time zone. */
const wallClock = (timezone: string, at: number) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

export type SnapshotSlot = {
  /** The site's calendar day, `YYYY-MM-DD`. */
  day: string;
  /** One of `SNAPSHOT_TIMES`. */
  time: string;
  /** The instant the slot stands for. */
  at: number;
};

/**
 * The slot a cycle that read the network at `at` may take, if `at` falls in
 * one's window. Snapshot times are far from the night's daylight-saving
 * changes, so the offset is the same at `at` and at the slot.
 */
export const slotAt = (timezone: string, at: number): SnapshotSlot | null => {
  const clock = wallClock(timezone, at);
  for (const time of SNAPSHOT_TIMES) {
    const offset = clock.minute - minuteOf(time);
    if (offset >= -EARLY_MINUTES && offset < LATE_MINUTES) {
      return {
        day: clock.day,
        time,
        at: Math.floor(at / MINUTE) * MINUTE - offset * MINUTE,
      };
    }
  }
  return null;
};
