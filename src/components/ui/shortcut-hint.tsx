import { useOptionHeld } from "@/hooks/use-shortcuts";
import { getShortcutDisplay, type ShortcutAction } from "@/lib/shortcuts";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

type ShortcutHintSize = "sm" | "default" | "lg";

const sizeClasses: Record<ShortcutHintSize, string> = {
  sm: "h-4 min-w-4 text-[10px] px-0.5",
  default: "",
  lg: "h-6 min-w-6 text-sm px-1.5",
};

const hintTransitionClassName =
  "inline-flex items-center gap-0.5 overflow-hidden transition-all duration-200 ease-out";

const hintVisibilityClassName = (isVisible: boolean): string =>
  isVisible
    ? "max-w-80 translate-y-0 opacity-100"
    : "max-w-0 -translate-y-0.5 opacity-0";

type ShortcutHintProps = {
  /** The action to display the shortcut for */
  action: ShortcutAction;
  /** Always show the hint, regardless of modifier key state */
  alwaysShow?: boolean;
  /** Additional class names */
  className?: string;
  /** Only show the first shortcut key combination */
  singleKey?: boolean;
  /** Size of the keyboard hints */
  size?: ShortcutHintSize;
};

/**
 * Displays keyboard shortcut hints for an action.
 * By default, only visible when the modifier key is held down.
 * Shows shortcuts in a subtle, elegant way similar to Linear.
 */
export function ShortcutHint({
  action,
  alwaysShow = false,
  className,
  singleKey = true,
  size = "default",
}: ShortcutHintProps) {
  const { isVisible: isModifierVisible } = useOptionHeld();
  const shortcutKeys = getShortcutDisplay(action);

  const isVisible = alwaysShow || isModifierVisible;

  if (shortcutKeys.length === 0) {
    return null;
  }

  const keysToShow = singleKey ? [shortcutKeys[0]] : shortcutKeys;

  return (
    <span
      className={cn(
        hintTransitionClassName,
        hintVisibilityClassName(isVisible),
        className,
      )}
    >
      {keysToShow.map((keys, index) => (
        <KbdGroup key={index}>
          {keys.map((key, keyIndex) => (
            <Kbd key={keyIndex} className={sizeClasses[size]}>
              {key}
            </Kbd>
          ))}
        </KbdGroup>
      ))}
    </span>
  );
}

type ShortcutHintKeysProps = {
  /** Array of keys to display */
  keys: string[];
  /** Always show the hint, regardless of modifier key state */
  alwaysShow?: boolean;
  /** Additional class names */
  className?: string;
  /** Size of the keyboard hints */
  size?: ShortcutHintSize;
  /** Additional class names applied to each Kbd element */
  kbdClassName?: string;
};

/**
 * Displays keyboard shortcut hints from raw keys.
 * By default, only visible when the modifier key is held down.
 * Use this for dynamic shortcuts that aren't predefined actions.
 */
export function ShortcutHintKeys({
  keys,
  alwaysShow = false,
  className,
  size = "default",
  kbdClassName,
}: ShortcutHintKeysProps) {
  const { isVisible: isModifierVisible } = useOptionHeld();

  const isVisible = alwaysShow || isModifierVisible;

  if (keys.length === 0) {
    return null;
  }

  return (
    <span
      className={cn(
        hintTransitionClassName,
        hintVisibilityClassName(isVisible),
        className,
      )}
    >
      <KbdGroup>
        {keys.map((key, keyIndex) => (
          <Kbd key={keyIndex} className={cn(sizeClasses[size], kbdClassName)}>
            {key}
          </Kbd>
        ))}
      </KbdGroup>
    </span>
  );
}

type ShortcutHintInlineProps = {
  /** The action to display the shortcut for */
  action: ShortcutAction;
  /** Additional class names */
  className?: string;
  /** Size of the keyboard hints */
  size?: ShortcutHintSize;
};

/**
 * Inline shortcut hint that animates in/out based on modifier key.
 * More subtle version meant for inline use in buttons/menus.
 */
export function ShortcutHintInline({
  action,
  className,
  size = "default",
}: ShortcutHintInlineProps) {
  const { isVisible: isModifierVisible } = useOptionHeld();
  const shortcutKeys = getShortcutDisplay(action);

  if (shortcutKeys.length === 0) {
    return null;
  }

  const firstKey = shortcutKeys[0];

  return (
    <span
      className={cn(
        "ml-auto",
        hintTransitionClassName,
        hintVisibilityClassName(isModifierVisible),
        className,
      )}
    >
      <KbdGroup>
        {firstKey.map((key, keyIndex) => (
          <Kbd key={keyIndex} className={sizeClasses[size]}>
            {key}
          </Kbd>
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
  /** Size of the keyboard hints */
  size?: ShortcutHintSize;
};

/**
 * Absolutely positioned shortcut hint that appears on modifier key hold.
 * Useful for placing hints on buttons or interactive elements.
 */
export function ShortcutHintAbsolute({
  action,
  position = "bottom-right",
  className,
  size = "default",
}: ShortcutHintAbsoluteProps) {
  const { isVisible: isModifierVisible } = useOptionHeld();
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
    "bottom-center": "-bottom-4 left-1/2 -translate-x-1/2 translate-y-1/2",
  };

  return (
    <span
      className={cn(
        "pointer-events-none absolute z-10 inline-flex items-center gap-0.5 transition-all duration-200 ease-out",
        positionClasses[position],
        isModifierVisible
          ? "translate-y-0 opacity-100"
          : "translate-y-0.5 opacity-0",
        className,
      )}
    >
      <KbdGroup>
        {firstKey.map((key, keyIndex) => (
          <Kbd key={keyIndex} className={cn("shadow-sm", sizeClasses[size])}>
            {key}
          </Kbd>
        ))}
      </KbdGroup>
    </span>
  );
}
