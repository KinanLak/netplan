export interface SiteSchedule {
  timezone: string;
  dayStartMinute: number;
  dayEndMinute: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const NETBOX_INTERVAL_MS = 15 * 60 * 1000;
export const LOCALIZATION_BACKOFF_MS = [
  4 * 60 * 1000,
  8 * 60 * 1000,
  16 * 60 * 1000,
  30 * 60 * 1000,
] as const;

interface LocalTime {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
}

const localFormatter = (timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

const localTime = (timestamp: number, timezone: string): LocalTime => {
  const parts = Object.fromEntries(
    localFormatter(timezone)
      .formatToParts(timestamp)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
};

const dateKey = ({ year, month, day }: LocalTime): string =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const easterSundayUtc = (year: number): number => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
};

export const franceMetropolitanHolidayKeys = (year: number): Set<string> => {
  const fixed = [
    [1, 1],
    [5, 1],
    [5, 8],
    [7, 14],
    [8, 15],
    [11, 1],
    [11, 11],
    [12, 25],
  ];
  const easter = easterSundayUtc(year);
  const movable = [1, 39, 50].map((days) => new Date(easter + days * DAY_MS));
  return new Set([
    ...fixed.map(
      ([month, day]) =>
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    ),
    ...movable.map(
      (date) =>
        `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`,
    ),
  ]);
};

const isWorkingDay = (value: LocalTime): boolean =>
  value.weekday !== "Sat" &&
  value.weekday !== "Sun" &&
  !franceMetropolitanHolidayKeys(value.year).has(dateKey(value));

const localMinute = (value: LocalTime): number =>
  value.hour * 60 + value.minute;

const sameLocalSlot = (left: LocalTime, right: LocalTime): boolean =>
  dateKey(left) === dateKey(right) &&
  left.hour === right.hour &&
  left.minute === right.minute;

const nextDayStart = (
  after: number,
  schedule: SiteSchedule,
): number | undefined => {
  const limit = after + 60 * 60 * 1000;
  for (
    let candidate = after + 60_000;
    candidate <= limit;
    candidate += 60_000
  ) {
    const local = localTime(candidate, schedule.timezone);
    if (isWorkingDay(local) && localMinute(local) === schedule.dayStartMinute) {
      return candidate;
    }
  }
  return undefined;
};

export const nextNominalAttempt = (
  lastAttemptAt: number,
  schedule: SiteSchedule,
): number => {
  const start = localTime(lastAttemptAt, schedule.timezone);
  const minute = localMinute(start);
  const daytime =
    isWorkingDay(start) &&
    minute >= schedule.dayStartMinute &&
    minute < schedule.dayEndMinute;
  const intervalMs = daytime ? 5 * 60 * 1000 : 60 * 60 * 1000;
  let candidate = lastAttemptAt + intervalMs;

  if (daytime) {
    for (
      let cursor = lastAttemptAt + 60_000;
      cursor <= candidate;
      cursor += 60_000
    ) {
      const local = localTime(cursor, schedule.timezone);
      if (
        dateKey(local) === dateKey(start) &&
        localMinute(local) === schedule.dayEndMinute
      ) {
        candidate = cursor;
        break;
      }
    }
  } else {
    candidate = nextDayStart(lastAttemptAt, schedule) ?? candidate;
  }

  // The autumn DST transition repeats local slots. Skip the duplicate slot.
  while (
    sameLocalSlot(start, localTime(candidate, schedule.timezone)) &&
    candidate > lastAttemptAt
  ) {
    candidate += intervalMs;
  }
  return candidate;
};

export const nextNetBoxAttempt = (lastAttemptAt: number): number =>
  lastAttemptAt + NETBOX_INTERVAL_MS;

export const localizationBackoffMs = (level: number): number =>
  LOCALIZATION_BACKOFF_MS[
    Math.min(Math.max(level, 1), LOCALIZATION_BACKOFF_MS.length) - 1
  ];

export const nextAfterFailure = (
  nominalAt: number,
  failedAt: number,
  backoffLevel: number,
): number =>
  Math.max(nominalAt, failedAt + localizationBackoffMs(backoffLevel));
