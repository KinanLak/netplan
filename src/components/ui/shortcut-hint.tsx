import { useOptionHeld } from "@/hooks/use-shortcuts";
import { getShortcutDisplay, type ShortcutAction } from "@/lib/shortcuts";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

type ShortcutHintProps = {
  /** The action to display the shortcut for */
  action: ShortcutAction;
  /** Always show the hint, regardless of Option key state */
  alwaysShow?: boolean;
  /** Additional class names */
  className?: string;
  /** Only show the first shortcut key combination */
  singleKey?: boolean;
};

/**
 * Displays keyboard shortcut hints for an action.
 * By default, only visible when the Option key is held down.
 * Shows shortcuts in a subtle, elegant way similar to Linear.
 */
export function ShortcutHint({
  action,
  alwaysShow = false,
  className,
  singleKey = true,
}: ShortcutHintProps) {
  const isOptionHeld = useOptionHeld();
  const shortcutKeys = getShortcutDisplay(action);

  const isVisible = alwaysShow || isOptionHeld;

  if (!isVisible || shortcutKeys.length === 0) {
    return null;
  }

  const keysToShow = singleKey ? [shortcutKeys[0]] : shortcutKeys;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 transition-opacity duration-150",
        isVisible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {keysToShow.map((keys, index) => (
        <KbdGroup key={index}>
          {keys.map((key, keyIndex) => (
            <Kbd key={keyIndex}>{key}</Kbd>
          ))}
        </KbdGroup>
      ))}
    </span>
  );
}

type ShortcutHintInlineProps = {
  /** The action to display the shortcut for */
  action: ShortcutAction;
  /** Additional class names */
  className?: string;
};

/**
 * Inline shortcut hint that animates in/out based on Option key.
 * More subtle version meant for inline use in buttons/menus.
 */
export function ShortcutHintInline({
  action,
  className,
}: ShortcutHintInlineProps) {
  const isOptionHeld = useOptionHeld();
  const shortcutKeys = getShortcutDisplay(action);

  if (shortcutKeys.length === 0) {
    return null;
  }

  const firstKey = shortcutKeys[0];

  return (
    <span
      className={cn(
        "ml-auto inline-flex items-center gap-0.5 overflow-hidden transition-all duration-200 ease-out",
        isOptionHeld ? "max-w-24 opacity-100" : "max-w-0 opacity-0",
        className,
      )}
    >
      <KbdGroup>
        {firstKey.map((key, keyIndex) => (
          <Kbd key={keyIndex}>{key}</Kbd>
        ))}
      </KbdGroup>
    </span>
  );
}

type ShortcutHintAbsoluteProps = {
  /** The action to display the shortcut for */
  action: ShortcutAction;
  /** Position of the hint */
  position?:
    | "top-right"
    | "bottom-right"
    | "top-left"
    | "bottom-left"
    | "bottom-center";
  /** Additional class names */
  className?: string;
};

/**
 * Absolutely positioned shortcut hint that appears on Option key hold.
 * Useful for placing hints on buttons or interactive elements.
 */
export function ShortcutHintAbsolute({
  action,
  position = "bottom-right",
  className,
}: ShortcutHintAbsoluteProps) {
  const isOptionHeld = useOptionHeld();
  const shortcutKeys = getShortcutDisplay(action);

  if (shortcutKeys.length === 0) {
    return null;
  }

  const firstKey = shortcutKeys[0];

  const positionClasses = {
    "top-right": "-top-1 -right-1 translate-x-1/4 -translate-y-1/4",
    "bottom-right": "-bottom-1 -right-1 translate-x-1/4 translate-y-1/4",
    "top-left": "-top-1 -left-1 -translate-x-1/4 -translate-y-1/4",
    "bottom-left": "-bottom-1 -left-1 -translate-x-1/4 translate-y-1/4",
    "bottom-center": "-bottom-1 left-1/2 -translate-x-1/2 translate-y-1/2",
  };

  return (
    <span
      className={cn(
        "pointer-events-none absolute z-10 inline-flex items-center gap-0.5 transition-all duration-200 ease-out",
        positionClasses[position],
        isOptionHeld ? "scale-100 opacity-100" : "scale-75 opacity-0",
        className,
      )}
    >
      <KbdGroup>
        {firstKey.map((key, keyIndex) => (
          <Kbd key={keyIndex} className="shadow-sm">
            {key}
          </Kbd>
        ))}
      </KbdGroup>
    </span>
  );
}
