import { describe, expect, it } from "bun:test";
import {
  getNextConnectionHighlightIds,
  matchesShortcutBinding,
  resolveShortcutIntent,
} from "@/lib/shortcut-intents";
import type {
  ShortcutIntentEvent,
  ShortcutIntentRegistration,
  ShortcutIntentRuntime,
} from "@/lib/shortcut-intents";
import type { ShortcutAction } from "@/lib/shortcuts";
import type { DeviceId } from "@/types/map";

const did = (s: string) => s as DeviceId;

const baseRuntime: ShortcutIntentRuntime = {
  activeDrawTool: "device",
  canEdit: true,
  currentFloorId: "floor-1",
  isEditMode: true,
  isInputFocused: false,
  isModalFocused: false,
  selectedDeviceId: null,
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
        actions: ["delete-device"],
        event: keyEvent({ code: "Delete", key: "Delete" }),
        runtime: { ...reader, selectedDeviceId: "device-1" },
      }),
    ).toBe(null);
  });

  it("keeps drawer and canvas scope exclusive", () => {
    expect(
      resolveAction({
        actions: ["delete", "delete-device"],
        event: keyEvent({ code: "Delete", key: "Delete" }),
        runtime: { ...baseRuntime, selectedDeviceId: "device-1" },
      }),
    ).toBe("delete-device");

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
          isModalFocused: true,
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

  it("computes connection highlights for selected and hovered devices", () => {
    const links = [
      { fromDeviceId: did("a"), toDeviceId: did("b") },
      { fromDeviceId: did("a"), toDeviceId: did("c") },
    ];

    expect(
      getNextConnectionHighlightIds({
        links,
        highlightedDeviceIds: [],
        hoveredDeviceId: null,
        selectedDeviceId: did("a"),
      }),
    ).toEqual([did("a"), did("b"), did("c")]);

    expect(
      getNextConnectionHighlightIds({
        links,
        highlightedDeviceIds: [],
        hoveredDeviceId: did("a"),
        selectedDeviceId: null,
      }),
    ).toEqual([did("a"), did("b"), did("c")]);

    expect(
      getNextConnectionHighlightIds({
        links,
        highlightedDeviceIds: [did("a"), did("b"), did("c")],
        hoveredDeviceId: did("a"),
        selectedDeviceId: null,
      }),
    ).toEqual([]);

    expect(
      getNextConnectionHighlightIds({
        links,
        highlightedDeviceIds: [did("a"), did("b"), did("c")],
        hoveredDeviceId: did("b"),
        selectedDeviceId: null,
      }),
    ).toEqual([]);
  });
});
