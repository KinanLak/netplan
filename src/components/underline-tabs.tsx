import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type UnderlineTab<T extends string> = {
  value: T;
  label: string;
  /** Shown after the label, muted. */
  count?: number;
};

/**
 * Views of one page, as underlined tabs: they read as a choice of view, not
 * as one more row of filters. Arrow keys move between them.
 */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
}: {
  tabs: ReadonlyArray<UnderlineTab<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Ties each tab to its panel: `${idPrefix}-tab-${value}`. */
  idPrefix: string;
}) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onChange(next.value);
    document.getElementById(`${idPrefix}-tab-${next.value}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 border-b">
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            id={`${idPrefix}-tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "-mb-px flex items-center gap-1.5 rounded-t-sm border-b-2 px-0.5 pb-2 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
              selected
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.count === undefined ? null : (
              <span className="text-muted-foreground tabular-nums">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
