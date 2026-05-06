import { describe, expect, it } from "bun:test";
import { deviceToolbarActions } from "@/panels/toolbar-actions";
import { availableDevicesCatalog } from "@/mock/availableDevices";
import { shortcuts } from "@/lib/shortcuts";
import {
  deviceKindRegistry,
  deviceToolShortcutActions,
  deviceTypes,
} from "./deviceKindRegistry";
import { deviceNodeTypes, toDeviceNode } from "./reactFlowDeviceAdapter";
import { resolveDeviceToolShortcut } from "./useDeviceToolShortcuts";
import type { Device, DeviceType } from "@/types/map";

const sorted = (values: Array<string>): Array<string> => values.toSorted();

describe("device kind registry", () => {
  it("registers every catalog device type at every device-kind seam", () => {
    const registryTypes = sorted(deviceTypes);
    const catalogTypes = sorted(Object.keys(availableDevicesCatalog));
    const toolbarTypes = sorted(
      deviceToolbarActions.map((action) => action.type),
    );

    expect(registryTypes).toEqual(catalogTypes);
    expect(toolbarTypes).toEqual(registryTypes);
    expect(sorted(Object.keys(deviceNodeTypes))).toEqual(registryTypes);
    expect(sorted(deviceToolShortcutActions)).toEqual(
      sorted(deviceToolbarActions.map((action) => action.shortcut)),
    );

    deviceTypes.forEach((type) => {
      const kind = deviceKindRegistry[type];

      expect(kind.type).toBe(type);
      expect(kind.label.length > 0).toBe(true);
      expect(kind.drawerLabel.length > 0).toBe(true);
      expect(kind.toolbar.id).toBe(type);
      expect(kind.toolbar.shortcut).toBe(kind.shortcut.action);
      expect(deviceNodeTypes[type]).toBe(kind.nodeAdapter);
      expect(shortcuts[kind.shortcut.action]).toEqual({
        keys: kind.shortcut.keys,
        label: kind.shortcut.label,
        description: kind.shortcut.description,
        scope: "canvas",
      });
      expect(availableDevicesCatalog[type].length > 0).toBe(true);
      expect(
        availableDevicesCatalog[type].every((device) => device.type === type),
      ).toBe(true);
      expect(
        availableDevicesCatalog[type].some(
          (device) =>
            device.size.width === kind.defaultSize.width &&
            device.size.height === kind.defaultSize.height,
        ),
      ).toBe(true);
    });
  });

  it("adapts a Device into the React Flow node shape", () => {
    const device: Device = {
      id: "device-1",
      type: "switch",
      name: "Switch 1",
      floorId: "floor-1",
      position: { x: 80, y: 120 },
      size: { width: 200, height: 60 },
      metadata: { status: "up" },
    };

    const node = toDeviceNode({
      device,
      selectedDeviceId: device.id,
      canEditDevices: true,
    });

    expect(node.id).toBe(device.id);
    expect(node.type).toBe(device.type);
    expect(node.position).toBe(device.position);
    expect(node.selected).toBe(true);
    expect(node.draggable).toBe(true);
    expect(node.data).toEqual({ data: device });
    expect(node.data.data).toBe(device);
    expect("selected" in node.data).toBe(false);
  });

  it("routes device tool shortcuts from registry metadata", () => {
    deviceTypes.forEach((type) => {
      const key = deviceKindRegistry[type].shortcut.keys[0];
      if (typeof key !== "string") {
        throw new TypeError("Device tool shortcut test expects string hotkeys");
      }

      expect(
        resolveDeviceToolShortcut({
          altKey: false,
          code: `Digit${key}`,
          ctrlKey: false,
          key,
          metaKey: false,
          shiftKey: false,
        }),
      ).toBe(type);
    });

    expect(
      resolveDeviceToolShortcut({
        altKey: false,
        code: "Digit5",
        ctrlKey: true,
        key: "5",
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe(null);
  });

  it("routes AZERTY top-row device tool shortcuts by physical digit code", () => {
    const azertyTopRowEvents = [
      { code: "Digit5", key: "(", type: "rack" },
      { code: "Digit6", key: "-", type: "switch" },
      { code: "Digit7", key: "è", type: "pc" },
      { code: "Digit8", key: "_", type: "wall-port" },
    ] as const;

    azertyTopRowEvents.forEach(({ code, key, type }) => {
      expect(
        resolveDeviceToolShortcut({
          altKey: false,
          code,
          ctrlKey: false,
          key,
          metaKey: false,
          shiftKey: false,
        }),
      ).toBe(type);
    });
  });
});

const registryCoversDeviceType: Record<DeviceType, unknown> =
  deviceKindRegistry;
void registryCoversDeviceType;
