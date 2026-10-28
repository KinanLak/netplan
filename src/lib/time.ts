// Every date and time the app shows is in the reader's time zone and the
// browser's locale, on a 24-hour clock, with the zone one hover away (owner,
// 2026-10-28): an en-US browser reads « Wed, Oct 21, 14:05 ». Relative words
// (« il y a 3 min », « Aujourd'hui ») stay French with the interface. Sites
// keep their own zone for their history's snapshot slots and days, never for
// display. `timeZone` is a parameter only so tests can pin it.

const MINUTE = 60_000;

/** The browser's IANA time zone. */
export const browserTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The locale dates are written in: `undefined` is the browser's own. Tests
 * pin it, since the runtime's default differs from one machine to another.
 */
export const displayLocale: { current: string | undefined } = {
  current: undefined,
};

const format = (
  at: number,
  options: Intl.DateTimeFormatOptions,
  timeZone: string | undefined,
) =>
  new Intl.DateTimeFormat(displayLocale.current, {
    hourCycle: "h23",
    ...options,
    timeZone: timeZone ?? browserTimeZone(),
  }).format(at);

const dayKey = (at: number, timeZone: string | undefined) =>
  format(at, { year: "numeric", month: "2-digit", day: "2-digit" }, timeZone);

const yearOf = (at: number, timeZone: string | undefined) =>
  format(at, { year: "numeric" }, timeZone);

/** `14:05` (fr-FR and en-US alike). */
export const formatTime = (at: number, timeZone?: string): string =>
  format(at, { hour: "2-digit", minute: "2-digit" }, timeZone);

/**
 * `mer. 21 oct., 14:05` in fr-FR, `Wed, Oct 21, 14:05` in en-US, with the
 * year when it is not this year's.
 */
export const formatDateTime = (
  at: number,
  now: number = Date.now(),
  timeZone?: string,
): string =>
  format(
    at,
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(yearOf(at, timeZone) !== yearOf(now, timeZone) && {
        year: "numeric",
      }),
      hour: "2-digit",
      minute: "2-digit",
    },
    timeZone,
  );

/** The time alone when it is today, the day and time otherwise. */
export const formatWhen = (
  at: number,
  now: number,
  timeZone?: string,
): string =>
  dayKey(at, timeZone) === dayKey(now, timeZone)
    ? formatTime(at, timeZone)
    : formatDateTime(at, now, timeZone);

/** How long ago, in words, falling back to the date after a day. */
export const formatAge = (
  at: number,
  now: number,
  timeZone?: string,
): string => {
  const minutes = Math.floor((now - at) / MINUTE);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `le ${formatWhen(at, now, timeZone)}`;
};

/**
 * `Europe/Paris • UTC+2` (`GMT+2` in en-US): the zone a time is shown in,
 * and its offset then.
 */
export const timeZoneHint = (at: number, timeZone?: string): string => {
  const zone = timeZone ?? browserTimeZone();
  const offset = new Intl.DateTimeFormat(displayLocale.current, {
    timeZone: zone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  if (zone === "UTC" || zone === "Etc/UTC" || !offset) return zone;
  return `${zone} • ${offset}`;
};

/** The hover hint of a relative time: when it was, and in which zone. */
export const ageHint = (
  at: number,
  now: number = Date.now(),
  timeZone?: string,
): string =>
  `${formatDateTime(at, now, timeZone)} · ${timeZoneHint(at, timeZone)}`;

/**
 * The reader's calendar day, `YYYY-MM-DD`: what groups a list by day and
 * what a date input reads and writes.
 */
export const dayOf = (at: number, timeZone?: string): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone ?? browserTimeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/** The calendar day before `YYYY-MM-DD`, whatever the clocks do that night. */
export const previousDay = (day: string): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) - 24 * 60 * MINUTE)
    .toISOString()
    .slice(0, 10);

/** The calendar day after `YYYY-MM-DD`. */
export const nextDay = (day: string): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + 24 * 60 * MINUTE)
    .toISOString()
    .slice(0, 10);

/** Whether `value` is a real calendar day written `YYYY-MM-DD`. */
export const isCalendarDay = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(Date.parse(`${value}T12:00:00Z`)).toISOString().slice(0, 10) ===
    value;

/**
 * « Aujourd'hui », « Hier », else `Mercredi 21 octobre` (`Wednesday, October
 * 21` in en-US), with the year when not this one.
 */
export const formatDay = (
  at: number,
  now: number,
  timeZone?: string,
): string => {
  const day = dayOf(at, timeZone);
  if (day === dayOf(now, timeZone)) return "Aujourd'hui";
  if (day === previousDay(dayOf(now, timeZone))) return "Hier";
  const label = format(
    at,
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(yearOf(at, timeZone) !== yearOf(now, timeZone) && {
        year: "numeric",
      }),
    },
    timeZone,
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const QUARTER = 15 * MINUTE;

/**
 * The first instant of the reader's day `YYYY-MM-DD`. The offset is read at
 * a first guess, then again in case midnight crosses a change of offset;
 * where the clocks skip midnight, the day starts at its first real minute.
 * Offsets and their changes fall on quarter hours.
 */
export const startOfDay = (day: string, timeZone?: string): number => {
  const asUtc = Date.parse(`${day}T00:00:00Z`);
  const offsetAt = (at: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timeZone ?? browserTimeZone(),
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
    const shown = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`,
    );
    return shown - at;
  };
  let start = asUtc - offsetAt(asUtc - offsetAt(asUtc));
  for (let step = 0; step < 16 && dayOf(start, timeZone) < day; step += 1) {
    start += QUARTER;
  }
  for (
    let step = 0;
    step < 16 && dayOf(start - QUARTER, timeZone) === day;
    step += 1
  ) {
    start -= QUARTER;
  }
  return start;
};
