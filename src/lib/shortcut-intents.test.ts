import { describe, expect, it } from "bun:test";
import {
  isShortcutWidgetTarget,
  matchesShortcutBinding,
  resolveShortcutIntent,
} from "@/lib/shortcut-intents";
import type {
  ShortcutIntentEvent,
  ShortcutIntentRegistration,
  ShortcutIntentRuntime,
} from "@/lib/shortcut-intents";
import { shortcuts } from "@/lib/shortcuts";
import type { ShortcutAction } from "@/lib/shortcuts";

const baseRuntime: ShortcutIntentRuntime = {
  activeDrawTool: "device",
  canEdit: true,
  currentFloorId: "floor-1",
  isEditMode: true,
  isInputFocused: false,
  isWidgetFocused: false,
  selectedDeviceId: null,
  selectionCount: 0,
  isMapFocused: true,
};

const keyEvent = (
  partial: Partial<ShortcutIntentEvent>,
): ShortcutIntentEvent => ({
  altKey: false,
  code: "",
  ctrlKey: false,
  key: "",
  metaKey: false,
  shiftKey: false,
  ...partial,
});

const registrations = (
  actions: Array<ShortcutAction>,
): Array<ShortcutIntentRegistration> =>
  actions.map((action) => ({ action, enabled: true, id: action }));

const resolveAction = ({
  event,
  runtime = baseRuntime,
  actions,
}: {
  actions: Array<ShortcutAction>;
  event: ShortcutIntentEvent;
  runtime?: ShortcutIntentRuntime;
}): ShortcutAction | null => {
  return (
    resolveShortcutIntent({
      event,
      registrations: registrations(actions),
      runtime,
    })?.action ?? null
  );
};

describe("shortcut intents", () => {
  it("routes Escape by drawer, canvas, then global priority", () => {
    const actions: Array<ShortcutAction> = [
      "escape",
      "cancel-wall-tool",
      "close-drawer",
    ];
    const escape = keyEvent({ code: "Escape", key: "Escape" });

    expect(
      resolveAction({
        actions,
        event: escape,
        runtime: { ...baseRuntime, selectedDeviceId: "device-1" },
      }),
    ).toBe("close-drawer");

    expect(
      resolveAction({
        actions,
        event: escape,
        runtime: { ...baseRuntime, activeDrawTool: "wall" },
      }),
    ).toBe("cancel-wall-tool");

    expect(resolveAction({ actions, event: escape })).toBe("escape");
  });

  it("opens a device's history on an archived site, but no edit", () => {
    const archived = {
      ...baseRuntime,
      canEdit: false,
      hasEditorRole: true,
      isEditMode: false,
      selectedDeviceId: "device-1",
    };
    expect(
      resolveAction({
        actions: ["show-device-history", "toggle-edit-mode"],
        event: keyEvent({ code: "KeyJ", key: "j" }),
        runtime: archived,
      }),
    ).toBe("show-device-history");
    expect(
      resolveAction({
        actions: ["show-device-history"],
        event: keyEvent({ code: "KeyJ", key: "j" }),
        runtime: { ...archived, hasEditorRole: false },
      }),
    ).toBeNull();
  });

  it("gives a reader no way into edit mode or its actions", () => {
    const reader = { ...baseRuntime, canEdit: false, isEditMode: false };
    const toggle = keyEvent({ code: "KeyE", key: "e" });

    expect(
      resolveAction({ actions: ["toggle-edit-mode"], event: toggle }),
    ).toBe("toggle-edit-mode");
    expect(
      resolveAction({
        actions: ["toggle-edit-mode"],
        event: toggle,
        runtime: reader,
      }),
    ).toBe(null);
    expect(
      resolveAction({
        actions: ["delete"],
        event: keyEvent({ code: "Delete", key: "Delete" }),
        runtime: { ...reader, selectedDeviceId: "device-1", selectionCount: 1 },
      }),
    ).toBe(null);
  });

  it("keeps drawer and canvas scope exclusive", () => {
    expect(
      resolveAction({
        actions: ["edit-device-identity", "tool-wall"],
        event: keyEvent({ code: "KeyI", key: "i" }),
        runtime: { ...baseRuntime, selectedDeviceId: "device-1" },
      }),
    ).toBe("edit-device-identity");

    expect(
      resolveAction({
        actions: ["tool-wall"],
        event: keyEvent({ code: "Digit1", key: "&" }),
        runtime: { ...baseRuntime, selectedDeviceId: "device-1" },
      }),
    ).toBe(null);
  });

  it("ignores shortcut routing while focus is in input-like UI", () => {
    expect(
      resolveAction({
        actions: ["sidebar-toggle"],
        event: keyEvent({ code: "KeyB", ctrlKey: true, key: "b" }),
        runtime: { ...baseRuntime, isInputFocused: true },
      }),
    ).toBe(null);
  });

  it("leaves Escape to focused modal UI", () => {
    expect(
      resolveAction({
        actions: ["escape", "close-drawer", "cancel-wall-tool"],
        event: keyEvent({ code: "Escape", key: "Escape" }),
        runtime: {
          ...baseRuntime,
          activeDrawTool: "wall",
          isWidgetFocused: true,
          selectedDeviceId: "device-1",
        },
      }),
    ).toBe(null);
  });

  it("routes platform key quirks through the same Module", () => {
    expect(
      resolveAction({
        actions: ["zoom-in"],
        event: keyEvent({ code: "NumpadAdd", key: "+" }),
      }),
    ).toBe("zoom-in");

    expect(
      resolveAction({
        actions: ["tool-wall"],
        event: keyEvent({ code: "Digit1", key: "&" }),
      }),
    ).toBe("tool-wall");

    expect(
      resolveAction({
        actions: ["tool-wall"],
        event: keyEvent({ code: "Digit1", ctrlKey: true, key: "1" }),
      }),
    ).toBe(null);
  });

  it("routes eraser size shortcuts only while the wall eraser is active", () => {
    const eraseRuntime: ShortcutIntentRuntime = {
      ...baseRuntime,
      activeDrawTool: "wall-erase",
    };

    expect(
      resolveAction({
        actions: ["wall-eraser-size-increase"],
        event: keyEvent({ code: "Equal", key: "+", shiftKey: true }),
        runtime: eraseRuntime,
      }),
    ).toBe("wall-eraser-size-increase");

    expect(
      resolveAction({
        actions: ["wall-eraser-size-decrease"],
        event: keyEvent({ code: "Minus", key: "_", shiftKey: true }),
        runtime: eraseRuntime,
      }),
    ).toBe("wall-eraser-size-decrease");

    expect(
      resolveAction({
        actions: ["wall-eraser-size-decrease"],
        event: keyEvent({ code: "Equal", key: "_", shiftKey: true }),
        runtime: eraseRuntime,
      }),
    ).toBe("wall-eraser-size-decrease");

    expect(
      resolveAction({
        actions: ["wall-eraser-size-increase"],
        event: keyEvent({ code: "Equal", key: "+", shiftKey: true }),
        runtime: { ...baseRuntime, activeDrawTool: "wall-brush" },
      }),
    ).toBe(null);
  });

  it("matches single character shortcuts case-insensitively before physical code fallback", () => {
    expect(
      matchesShortcutBinding(keyEvent({ code: "KeyW", key: "z" }), "Z"),
    ).toBe(true);
  });

  it("opens the calque panel only in edit mode, but toggles its visibility when reading", () => {
    const actions: Array<ShortcutAction> = [
      "toggle-overlay-panel",
      "toggle-overlay-visibility",
    ];
    const c = keyEvent({ code: "KeyC", key: "c" });
    const shiftC = keyEvent({ code: "KeyC", key: "C", shiftKey: true });
    const reading = { ...baseRuntime, isEditMode: false };

    expect(resolveAction({ actions, event: c })).toBe("toggle-overlay-panel");
    expect(resolveAction({ actions, event: shiftC })).toBe(
      "toggle-overlay-visibility",
    );
    expect(resolveAction({ actions, event: c, runtime: reading })).toBe(null);
    expect(resolveAction({ actions, event: shiftC, runtime: reading })).toBe(
      "toggle-overlay-visibility",
    );
    expect(
      resolveAction({
        actions,
        event: shiftC,
        runtime: { ...baseRuntime, currentFloorId: null },
      }),
    ).toBe(null);
  });

  it("locks the calque with Shift+L, apart from the room tool's L, and only in edit mode", () => {
    const actions: Array<ShortcutAction> = ["tool-room", "toggle-overlay-lock"];
    const l = keyEvent({ code: "KeyL", key: "l" });
    const shiftL = keyEvent({ code: "KeyL", key: "L", shiftKey: true });

    expect(resolveAction({ actions, event: l })).toBe("tool-room");
    expect(resolveAction({ actions, event: shiftL })).toBe(
      "toggle-overlay-lock",
    );
    expect(
      resolveAction({
        actions,
        event: shiftL,
        runtime: { ...baseRuntime, isEditMode: false },
      }),
    ).toBe(null);
  });

  it("calibrates the calque with Shift+E, apart from edit mode's E", () => {
    const actions: Array<ShortcutAction> = [
      "toggle-edit-mode",
      "calibrate-overlay",
    ];
    const e = keyEvent({ code: "KeyE", key: "e" });
    const shiftE = keyEvent({ code: "KeyE", key: "E", shiftKey: true });

    expect(resolveAction({ actions, event: e })).toBe("toggle-edit-mode");
    expect(resolveAction({ actions, event: shiftE })).toBe("calibrate-overlay");
    expect(
      resolveAction({
        actions,
        event: shiftE,
        runtime: { ...baseRuntime, isEditMode: false },
      }),
    ).toBe(null);
  });

  it("leaves the arrow keys to the browser: they never pan the map", () => {
    const actions = Object.keys(shortcuts) as Array<ShortcutAction>;
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(
        resolveAction({ actions, event: keyEvent({ code: key, key }) }),
      ).toBe(null);
    }
  });

  it("fits the floor with Shift+1 whatever the layout prints", () => {
    expect(
      resolveAction({
        actions: ["fit-view", "tool-wall"],
        // QWERTY prints "!", AZERTY prints "1"; both are the Digit1 key.
        event: keyEvent({ code: "Digit1", key: "!", shiftKey: true }),
      }),
    ).toBe("fit-view");
    expect(
      resolveAction({
        actions: ["fit-view", "tool-wall"],
        event: keyEvent({ code: "Digit1", key: "1", shiftKey: true }),
      }),
    ).toBe("fit-view");
    expect(
      resolveAction({
        actions: ["fit-view", "tool-wall"],
        event: keyEvent({ code: "Digit1", key: "1" }),
      }),
    ).toBe("tool-wall");
  });

  it("treats a key from an open menu or list as the widget's own", () => {
    document.body.innerHTML = `
      <div data-slot="dropdown-menu-content"><button id="item">Clair</button></div>
      <div role="listbox"><div id="option" tabindex="0">Option</div></div>
      <div data-slot="sheet-content" role="dialog"><a id="floor">Étage 1</a></div>
      <button id="plain">Inventaire</button>`;
    expect(isShortcutWidgetTarget(document.getElementById("item"))).toBe(true);
    expect(isShortcutWidgetTarget(document.getElementById("option"))).toBe(
      true,
    );
    expect(isShortcutWidgetTarget(document.getElementById("floor"))).toBe(true);
    expect(isShortcutWidgetTarget(document.getElementById("plain"))).toBe(
      false,
    );
    document.body.innerHTML = "";
  });

  it("nudges a selection with the arrows only from the map, in edit mode", () => {
    const arrow = keyEvent({ code: "ArrowLeft", key: "ArrowLeft" });
    const selected = { ...baseRuntime, selectionCount: 2 };
    expect(
      resolveAction({
        actions: ["nudge-selection"],
        event: arrow,
        runtime: selected,
      }),
    ).toBe("nudge-selection");
    expect(
      resolveAction({
        actions: ["nudge-selection"],
        event: keyEvent({
          code: "ArrowLeft",
          key: "ArrowLeft",
          shiftKey: true,
        }),
        runtime: selected,
      }),
    ).toBe("nudge-selection");
    for (const runtime of [
      { ...selected, isMapFocused: false },
      { ...selected, isEditMode: false },
      { ...selected, selectionCount: 0 },
      { ...selected, activeDrawTool: "wall" as const },
    ]) {
      expect(
        resolveAction({ actions: ["nudge-selection"], event: arrow, runtime }),
      ).toBe(null);
    }
  });

  it("takes the selection off the plan with Delete, and selects all with Ctrl+A", () => {
    const del = keyEvent({ code: "Delete", key: "Delete" });
    expect(
      resolveAction({
        actions: ["delete"],
        event: del,
        runtime: { ...baseRuntime, selectionCount: 3 },
      }),
    ).toBe("delete");
    expect(resolveAction({ actions: ["delete"], event: del })).toBe(null);
    expect(
      resolveAction({
        actions: ["select-all"],
        event: keyEvent({ code: "KeyA", key: "a", ctrlKey: true }),
      }),
    ).toBe("select-all");
  });
});
