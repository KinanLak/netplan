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
import { useMapUiStore } from "@/store/useMapUiStore";

type UseShortcutOptions = {
  enabled?: boolean;
  ignoreInputs?: boolean;
};

const DEFAULT_SHORTCUT_OPTIONS: UseShortcutOptions = {};
const OVERLAY_MODIFIER_KEY = isMac
  ? OVERLAY_MODIFIER_KEY_BY_PLATFORM.mac
  : OVERLAY_MODIFIER_KEY_BY_PLATFORM.nonMac;

function useScopeEnabled(
  scope: ShortcutScope,
  extraEnabled: boolean = true,
): boolean {
  const selectedDeviceId = useMapUiStore((state) => state.selectedDeviceId);

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

const NOOP_KEY: RegisterableHotkey = "F12";
const noop: HotkeyCallback = () => {};

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

  const key0 = config.keys[0];
  useHotkey(key0, callback, baseOptions);

  const key1 = config.keys.length > 1 ? config.keys[1] : NOOP_KEY;
  const opts1: UseHotkeyOptions =
    config.keys.length > 1 ? baseOptions : { ...baseOptions, enabled: false };
  useHotkey(key1, config.keys.length > 1 ? callback : noop, opts1);
}

export function useOptionHeld(delay = OVERLAY_VISIBILITY_DELAY_MS) {
  const [isHeld, setIsHeld] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === OVERLAY_MODIFIER_KEY && !event.repeat) {
        setIsHeld(true);
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
