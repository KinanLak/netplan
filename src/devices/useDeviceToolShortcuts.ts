import { useEffect } from "react";
import type { RegisterableHotkey } from "@tanstack/react-hotkeys";
import { deviceKinds } from "@/devices/deviceKindRegistry";
import { isMac } from "@/lib/shortcuts";
import { useMapStore } from "@/store/useMapStore";
import type { DeviceType } from "@/types/map";

interface UseDeviceToolShortcutsParams {
  enabled: boolean;
  onSelectDeviceType: (type: DeviceType) => void;
}

type KeyboardShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

const isInputTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
};

const matchesKey = (event: KeyboardShortcutEvent, key: string): boolean => {
  if (event.key === key) {
    return true;
  }

  if (key.length !== 1) {
    return false;
  }

  const upperKey = key.toUpperCase();
  return (
    event.code === `Key${upperKey}` ||
    event.code === `Digit${key}` ||
    event.code === `Numpad${key}`
  );
};

const matchesModifiers = (
  event: KeyboardShortcutEvent,
  modifiers: {
    alt?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    mod?: boolean;
    shift?: boolean;
  },
): boolean => {
  const requiredCtrl = Boolean(modifiers.ctrl || (modifiers.mod && !isMac));
  const requiredMeta = Boolean(modifiers.meta || (modifiers.mod && isMac));

  return (
    event.altKey === Boolean(modifiers.alt) &&
    event.ctrlKey === requiredCtrl &&
    event.metaKey === requiredMeta &&
    event.shiftKey === Boolean(modifiers.shift)
  );
};

const matchesHotkey = (
  event: KeyboardShortcutEvent,
  hotkey: RegisterableHotkey,
): boolean => {
  if (typeof hotkey !== "string") {
    return matchesModifiers(event, hotkey) && matchesKey(event, hotkey.key);
  }

  const parts = hotkey.split("+");
  const key = parts.at(-1);
  if (!key) {
    return false;
  }

  const modifiers = {
    alt: parts.includes("Alt"),
    ctrl: parts.includes("Control") || parts.includes("Ctrl"),
    meta: parts.includes("Meta"),
    mod: parts.includes("Mod"),
    shift: parts.includes("Shift"),
  };

  return matchesModifiers(event, modifiers) && matchesKey(event, key);
};

export const resolveDeviceToolShortcut = (
  event: KeyboardShortcutEvent,
): DeviceType | null => {
  for (const kind of deviceKinds) {
    if (kind.shortcut.keys.some((key) => matchesHotkey(event, key))) {
      return kind.type;
    }
  }

  return null;
};

export function useDeviceToolShortcuts({
  enabled,
  onSelectDeviceType,
}: UseDeviceToolShortcutsParams) {
  const selectedDeviceId = useMapStore((state) => state.selectedDeviceId);

  useEffect(() => {
    if (!enabled || selectedDeviceId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInputTarget(event.target)) {
        return;
      }

      const type = resolveDeviceToolShortcut(event);
      if (!type) {
        return;
      }

      event.preventDefault();
      onSelectDeviceType(type);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled, onSelectDeviceType, selectedDeviceId]);
}
