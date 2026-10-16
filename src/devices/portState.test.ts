import { describe, expect, it } from "bun:test";
import { portColumns, portState, shownPorts } from "./portState";
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
