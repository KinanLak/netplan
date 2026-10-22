import { describe, expect, it } from "bun:test";
import {
  portColumns,
  portLabel,
  portState,
  shortPortName,
  shownPorts,
} from "./portState";
import { numberedPorts } from "./ports";
import type { DeviceId } from "@/types/map";

describe("port states", () => {
  it("puts a device seen before the link, and the link before nothing", () => {
    expect(portState({ status: "down", seen: true })).toBe("seen");
    expect(portState({ status: "up" })).toBe("up");
    expect(portState({ status: "down" })).toBe("down");
    expect(portState({ status: "unknown" })).toBe("unknown");
    expect(portState({})).toBe("unknown");
  });

  it("shows a patch panel's front ports once, and a switch's rear ports", () => {
    const panel = numberedPorts("device:panel" as DeviceId, "front", 2);
    expect(shownPorts(panel).map((port) => port.kind)).toEqual([
      "front",
      "front",
    ]);
    const rearOnly = panel
      .filter((port) => port.kind === "rear")
      .map((port) => ({ ...port, deviceId: "device:sw" as DeviceId }));
    expect(shownPorts(rearOnly)).toHaveLength(2);
  });

  it("lays ports in two rows up to 48, then rows of 24", () => {
    expect([1, 8, 24, 48, 52, 96].map(portColumns)).toEqual([
      1, 4, 12, 24, 24, 24,
    ]);
  });
});

describe("port names", () => {
  it("says the side of a patch panel's port only", () => {
    const rear = { name: "GigabitEthernet1/0/1", kind: "rear" as const };
    expect(portLabel(rear, "switch")).toBe("GigabitEthernet1/0/1");
    expect(portLabel({ name: "1", kind: "front" }, "patch-panel")).toBe(
      "Avant 1",
    );
    expect(portLabel({ name: "1", kind: "front" }, "wall-port")).toBe("1");
    expect(portLabel({ name: "1", kind: "front" })).toBe("Avant 1");
    expect(portLabel({ name: "enp4s0", kind: "interface" }, "pc")).toBe(
      "enp4s0",
    );
  });

  it("shortens interface names as Cisco does, and leaves others alone", () => {
    expect(shortPortName("GigabitEthernet1/0/1")).toBe("Gi1/0/1");
    expect(shortPortName("GigabitEthernet 1/1")).toBe("Gi1/1");
    expect(shortPortName("TenGigabitEthernet1/1/1")).toBe("Te1/1/1");
    expect(shortPortName("Ethernet1/49")).toBe("Eth1/49");
    expect(shortPortName("enp4s0")).toBe("enp4s0");
    expect(shortPortName("vmbr0")).toBe("vmbr0");
    expect(shortPortName("12")).toBe("12");
  });
});
