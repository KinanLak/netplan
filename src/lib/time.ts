// Every date and time the app shows is in the reader's time zone, on a
// 24-hour clock, with the zone one hover away. Sites keep their own zone for
// what they schedule (business hours, snapshot slots), never for display.
// `timeZone` is a parameter only so tests can pin it.

const MINUTE = 60_000;

/** The browser's IANA time zone. */
export const browserTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

const format = (
  at: number,
  options: Intl.DateTimeFormatOptions,
  timeZone: string | undefined,
) =>
  new Intl.DateTimeFormat("fr-FR", {
    hourCycle: "h23",
    ...options,
    timeZone: timeZone ?? browserTimeZone(),
  }).format(at);

const dayKey = (at: number, timeZone: string | undefined) =>
  format(at, { year: "numeric", month: "2-digit", day: "2-digit" }, timeZone);

const yearOf = (at: number, timeZone: string | undefined) =>
  format(at, { year: "numeric" }, timeZone);

/** `14:05`. */
export const formatTime = (at: number, timeZone?: string): string =>
  format(at, { hour: "2-digit", minute: "2-digit" }, timeZone);

/** `mer. 21 oct., 14:05`, with the year when it is not this year's. */
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

/** `Europe/Paris • UTC+2`: the zone a time is shown in, and its offset then. */
export const timeZoneHint = (at: number, timeZone?: string): string => {
  const zone = timeZone ?? browserTimeZone();
  const offset = new Intl.DateTimeFormat("fr-FR", {
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
