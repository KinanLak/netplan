import { useEffect, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import type {
  HotkeyCallback,
  RegisterableHotkey,
  UseHotkeyOptions,
} from "@tanstack/react-hotkeys";
import type { ShortcutAction, ShortcutScope } from "@/lib/shortcuts";
import { isMac, shortcuts } from "@/lib/shortcuts";
import {
  OVERLAY_MODIFIER_KEY_BY_PLATFORM,
  OVERLAY_VISIBILITY_DELAY_MS,
} from "@/lib/constants";
import { useMapStore } from "@/store/useMapStore";

type UseShortcutOptions = {
  /** Override the enabled state (combined with scope) */
  enabled?: boolean;
  /** Ignore hotkey when focus is in input-like elements. Defaults based on TanStack smart detection. */
  ignoreInputs?: boolean;
};

const DEFAULT_SHORTCUT_OPTIONS: UseShortcutOptions = {};
const OVERLAY_MODIFIER_KEY = isMac
  ? OVERLAY_MODIFIER_KEY_BY_PLATFORM.mac
  : OVERLAY_MODIFIER_KEY_BY_PLATFORM.nonMac;

/**
 * Compute whether a scope is currently active.
 * Global → always true.
 * Canvas → true when no device is selected (drawer closed).
 * Drawer → true when a device is selected (drawer open).
 */
function useScopeEnabled(
  scope: ShortcutScope,
  extraEnabled: boolean = true,
): boolean {
  const selectedDeviceId = useMapStore((s) => s.selectedDeviceId);

  if (!extraEnabled) return false;

  switch (scope) {
    case "global":
      return true;
    case "canvas":
      return selectedDeviceId === null;
    case "drawer":
      return selectedDeviceId !== null;
  }
}

// Sentinel for unused hotkey slots (must be a valid hotkey to satisfy types)
const NOOP_KEY: RegisterableHotkey = "F12";
const noop: HotkeyCallback = () => {};

/**
 * Hook to register a keyboard shortcut by action name.
 * Automatically resolves key bindings and scope from the shortcuts config.
 *
 * Uses fixed-count `useHotkey` calls (MAX_KEYS_PER_ACTION = 3) to satisfy
 * React's rules of hooks — unused slots get a disabled sentinel key.
 */
export function useShortcut(
  action: ShortcutAction,
  handler: (event: KeyboardEvent) => void,
  options: UseShortcutOptions = DEFAULT_SHORTCUT_OPTIONS,
) {
  const { enabled = true, ignoreInputs } = options;
  const config = shortcuts[action];
  const scopeEnabled = useScopeEnabled(config.scope, enabled);

  const callback: HotkeyCallback = (event) => {
    handler(event);
  };

  const baseOptions: UseHotkeyOptions = {
    conflictBehavior: "warn",
    enabled: scopeEnabled,
    ...(ignoreInputs !== undefined ? { ignoreInputs } : {}),
  };

  // Slot 0 — always present (keys has at least one entry)
  const key0 = config.keys[0];
  useHotkey(key0, callback, baseOptions);

  // Slot 1 — second binding or disabled sentinel
  const key1 = config.keys.length > 1 ? config.keys[1] : NOOP_KEY;
  const opts1: UseHotkeyOptions =
    config.keys.length > 1 ? baseOptions : { ...baseOptions, enabled: false };
  useHotkey(key1, config.keys.length > 1 ? callback : noop, opts1);

  // Slot 2 — third binding or disabled sentinel
  const key2 = config.keys.length > 2 ? config.keys[2] : NOOP_KEY;
  const opts2: UseHotkeyOptions =
    config.keys.length > 2 ? baseOptions : { ...baseOptions, enabled: false };
  useHotkey(key2, config.keys.length > 2 ? callback : noop, opts2);
}

/**
 * Hook to track if the overlay modifier key is held.
 * Ctrl on Windows/Linux, Cmd on macOS.
 * Used for showing shortcuts overlay (Linear-style).
 *
 * Kept as native addEventListener — this tracks modifier hold state, not a hotkey.
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
