import {
  ageHint,
  formatAge,
  formatDateTime,
  formatTime,
  formatWhen,
  timeZoneHint,
} from "@/lib/time";

type TimeProps = { at: number; className?: string } & (
  | {
      format: "when" | "age";
      /** Today, from `useNow`, so the text ages on screen. */
      now: number;
    }
  | {
      format?: "time" | "datetime";
      /** Which year is this one; the current year by default. */
      now?: number;
    }
);

/**
 * A date or time in the reader's zone. Hovering it names the zone, and for
 * an age, the date it stands for.
 */
export function Time({ at, className, ...props }: TimeProps) {
  const text =
    props.format === "time"
      ? formatTime(at)
      : props.format === "when"
        ? formatWhen(at, props.now)
        : props.format === "age"
          ? formatAge(at, props.now)
          : formatDateTime(at, props.now);
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={props.format === "age" ? ageHint(at, props.now) : timeZoneHint(at)}
      className={className}
    >
      {text}
    </time>
  );
}
