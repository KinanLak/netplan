/**
 * When the network saw something, on the reader's 24-hour clock: the time
 * alone today, with the day otherwise.
 */
export const formatSeenAt = (at: number, now: number = Date.now()): string =>
  new Intl.DateTimeFormat("fr-FR", {
    hourCycle: "h23",
    ...(new Date(at).toDateString() === new Date(now).toDateString()
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  }).format(at);
