import { useEffect, useState } from "react";
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook";
import type { Options } from "react-hotkeys-hook";
import type { ShortcutAction, ShortcutScope } from "@/lib/shortcuts";
import {
  OVERLAY_MODIFIER_KEY_BY_PLATFORM,
  OVERLAY_VISIBILITY_DELAY_MS,
  SHORTCUT_FORM_TAGS,
} from "@/lib/constants";
import { getHotkey, getScope, isMac } from "@/lib/shortcuts";

export { useHotkeysContext };

type UseShortcutOptions = {
  /** Override the enabled state */
  enabled?: boolean;
  /** Enable on form tags (input, textarea, select) */
  enableOnFormTags?: boolean;
};

type UseHotkeyDirectOptions = {
  scope?: ShortcutScope;
  enabled?: boolean;
  enableOnFormTags?: boolean;
};

type HotkeyHandler = (event?: KeyboardEvent) => void;

const DEFAULT_SHORTCUT_OPTIONS: UseShortcutOptions = {};
const DEFAULT_HOTKEY_DIRECT_OPTIONS: UseHotkeyDirectOptions = {};
const OVERLAY_MODIFIER_KEY = isMac
  ? OVERLAY_MODIFIER_KEY_BY_PLATFORM.mac
  : OVERLAY_MODIFIER_KEY_BY_PLATFORM.nonMac;

/**
 * Hook to register a keyboard shortcut by action name
 * Automatically uses the hotkey and scope from the shortcuts config
 */
export function useShortcut(
  action: ShortcutAction,
  handler: HotkeyHandler,
  options: UseShortcutOptions = DEFAULT_SHORTCUT_OPTIONS,
) {
  const { enabled = true, enableOnFormTags = false } = options;
  const hotkey = getHotkey(action);
  const scope = getScope(action);

  // Convert array to comma-separated string if needed
  const hotkeyString = Array.isArray(hotkey) ? hotkey.join(", ") : hotkey;

  const hotkeyOptions: Options = {
    scopes: [scope],
    enabled,
    preventDefault: true,
    // Use produced characters instead of physical key codes so letter shortcuts
    // stay stable across keyboard layouts (e.g. W stays "w" on AZERTY/QWERTY).
    useKey: true,
    enableOnFormTags: enableOnFormTags ? SHORTCUT_FORM_TAGS : false,
  };

  useHotkeys(
    hotkeyString,
    (keyboardEvent) => {
      handler(keyboardEvent);
    },
    hotkeyOptions,
    [handler, enabled],
  );
}

/**
 * Hook to directly use a hotkey string (for custom cases)
 */
export function useHotkeyDirect(
  hotkey: string | Array<string>,
  handler: HotkeyHandler,
  options: UseHotkeyDirectOptions = DEFAULT_HOTKEY_DIRECT_OPTIONS,
) {
  const {
    scope = "global",
    enabled = true,
    enableOnFormTags = false,
  } = options;

  const hotkeyString = Array.isArray(hotkey) ? hotkey.join(", ") : hotkey;

  const hotkeyOptions: Options = {
    scopes: [scope],
    enabled,
    preventDefault: true,
    enableOnFormTags: enableOnFormTags ? SHORTCUT_FORM_TAGS : false,
  };

  useHotkeys(
    hotkeyString,
    (keyboardEvent) => {
      handler(keyboardEvent);
    },
    hotkeyOptions,
    [handler, enabled],
  );
}

/**
 * Hook to enable/disable the drawer scope
 * Call this in drawer components to activate drawer-specific shortcuts
 */
export function useDrawerScope(isOpen: boolean) {
  const { enableScope, disableScope } = useHotkeysContext();

  useEffect(() => {
    if (isOpen) {
      enableScope("drawer");
      disableScope("canvas");
    } else {
      disableScope("drawer");
      enableScope("canvas");
    }

    return () => {
      disableScope("drawer");
      enableScope("canvas");
    };
  }, [isOpen, enableScope, disableScope]);
}

/**
 * Hook to track if the overlay modifier key is held
 * Ctrl on Windows/Linux, Cmd on macOS
 * Used for showing shortcuts overlay (Linear-style)
 */
export function useOptionHeld(delay = OVERLAY_VISIBILITY_DELAY_MS) {
  const [isHeld, setIsHeld] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === OVERLAY_MODIFIER_KEY && !event.repeat) {
        setIsHeld(true);
        // Delay before showing overlay
        timeoutId = setTimeout(() => {
          setIsVisible(true);
        }, delay);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === OVERLAY_MODIFIER_KEY) {
        setIsHeld(false);
        setIsVisible(false);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    };

    const handleBlur = () => {
      setIsHeld(false);
      setIsVisible(false);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [delay]);

  return { isHeld, isVisible };
}

/**
 * Hook to manage scopes imperatively
 */
export function useScopes() {
  const { enableScope, disableScope, activeScopes } = useHotkeysContext();

  const setScope = (scope: ShortcutScope, active: boolean) => {
    if (active) {
      enableScope(scope);
    } else {
      disableScope(scope);
    }
  };

  const isActive = (scope: ShortcutScope) => activeScopes.includes(scope);

  return { setScope, isActive, activeScopes };
}
