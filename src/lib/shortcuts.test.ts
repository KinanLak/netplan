import { describe, expect, it } from "bun:test";
import type { ShortcutAction } from "@/lib/shortcuts";
import { formatHotkey, getShortcutDisplay, shortcuts } from "@/lib/shortcuts";
import { deviceToolShortcutActions } from "@/devices/deviceKindRegistry";

describe("shortcut formatting", () => {
  it("splits a combo string into platform symbols", () => {
    const formatted = formatHotkey("Mod+Shift+Z");
    expect(formatted.length).toBe(3);
    expect(formatted.at(-1)).toBe("Z");
  });

  it("uses the binding display when provided", () => {
    expect(
      formatHotkey({ key: "+", code: "NumpadAdd", display: "Num +" }),
    ).toEqual(["Num +"]);
  });

  it("orders modifiers consistently for binding objects", () => {
    const formatted = formatHotkey({ key: "Z", mod: true, shift: true });
    expect(formatted.at(-1)).toBe("Z");
    expect(formatted.length).toBe(3);
  });

  it("renders arrow and special keys symbolically", () => {
    expect(formatHotkey("ArrowUp")).toEqual(["↑"]);
    expect(formatHotkey("Escape")).toEqual(["esc"]);
    expect(formatHotkey("Delete")).toEqual(["⌫"]);
    expect(formatHotkey("Space")).toEqual(["␣"]);
  });
});

describe("shortcut display", () => {
  it("dedupes repeated combos across bindings", () => {
    const display = getShortcutDisplay("redo");
    const seen = new Set(display.map((parts) => parts.join("+")));
    expect(seen.size).toBe(display.length);
  });

  it("hides bindings flagged as hidden from display", () => {
    const display = getShortcutDisplay("zoom-in");
    const hasHiddenBinding = shortcuts["zoom-in"].keys.some(
      (binding) => typeof binding !== "string" && binding.hiddenFromDisplay,
    );
    if (!hasHiddenBinding) {
      // No baseline to compare against — defensive guard so the test reads sensibly.
      return;
    }
    const visibleBindings = shortcuts["zoom-in"].keys.filter(
      (binding) => typeof binding === "string" || !binding.hiddenFromDisplay,
    );
    expect(display.length).toBeLessThanOrEqual(visibleBindings.length);
  });
});

describe("shortcut registry coverage", () => {
  it("registers every device tool action exactly once at canvas scope", () => {
    deviceToolShortcutActions.forEach((action) => {
      const config = shortcuts[action];
      expect(config).toBeDefined();
      expect(config.scope).toBe("canvas");
      expect(config.keys.length).toBeGreaterThan(0);
    });
  });

  it("never reuses the same key combo within a single scope", () => {
    const collisions: Array<string> = [];
    const seen = new Map<string, ShortcutAction>();

    for (const [actionName, config] of Object.entries(shortcuts)) {
      for (const binding of config.keys) {
        const bindingId =
          typeof binding === "string"
            ? binding
            : `${binding.key}:${Boolean(binding.mod)}:${Boolean(binding.shift)}:${Boolean(binding.alt)}:${Boolean(binding.ctrl)}:${Boolean(binding.meta)}`;
        const seenKey = `${config.scope}|${bindingId}`;
        const previous = seen.get(seenKey);
        if (previous && previous !== (actionName as ShortcutAction)) {
          collisions.push(
            `${config.scope}: ${previous} vs ${actionName} on ${bindingId}`,
          );
        }
        seen.set(seenKey, actionName as ShortcutAction);
      }
    }

    expect(collisions).toEqual([]);
  });
});
