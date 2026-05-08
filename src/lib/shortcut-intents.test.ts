import { describe, expect, it } from "bun:test";
import { deviceKinds } from "@/devices/deviceKindRegistry";
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
        actions: ["tool-rack"],
        event: keyEvent({ code: "Digit5", key: "(" }),
      }),
    ).toBe("tool-rack");

    expect(
      resolveAction({
        actions: ["tool-rack"],
        event: keyEvent({ code: "Digit5", ctrlKey: true, key: "5" }),
      }),
    ).toBe(null);
  });

  it("matches single character shortcuts case-insensitively before physical code fallback", () => {
    expect(
      matchesShortcutBinding(keyEvent({ code: "KeyW", key: "z" }), "Z"),
    ).toBe(true);
  });

  it("routes every device tool shortcut from registry metadata", () => {
    deviceKinds.forEach((kind) => {
      const key = kind.shortcut.keys[0];
      if (typeof key !== "string") {
        throw new TypeError("Device tool shortcut test expects string hotkeys");
      }

      expect(
        resolveAction({
          actions: [kind.shortcut.action],
          event: keyEvent({ code: `Digit${key}`, key }),
        }),
      ).toBe(kind.shortcut.action);
    });
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
