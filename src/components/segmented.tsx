import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Shown after the label, muted. */
  count?: number;
};

/**
 * One choice among a few, as a pressed button in a muted track: the chosen
 * one stands out from a hovered one.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-fit gap-1 rounded-lg bg-muted p-1"
    >
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
              pressed
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count === undefined ? null : (
              <span className="text-muted-foreground tabular-nums">
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
