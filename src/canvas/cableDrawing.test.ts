import { describe, expect, it } from "bun:test";
import { cableDropResult, cableStart } from "./cableDrawing";
import { defaultPorts } from "@/devices/ports";
import type { Cable, CableId, Device, DeviceId, Port } from "@/types/map";

const id = (value: string) => value as DeviceId;

const devices: Array<Pick<Device, "id" | "type" | "name">> = [
  { id: id("sw"), type: "switch", name: "Accès" },
  { id: id("wall"), type: "wall-port", name: "Prise 1" },
  { id: id("wall2"), type: "wall-port", name: "Prise 2" },
  { id: id("pc"), type: "pc", name: "Poste" },
];

const ports: Array<Port> = devices.flatMap(({ id: deviceId, type }) =>
  defaultPorts(deviceId, type),
);
const portOf = (deviceId: string, n = 0) =>
  ports.filter((port) => port.deviceId === deviceId)[n];

const cable = (a: Port, b: Port): Cable => ({
  id: `cable:${a.id}` as CableId,
  a: { deviceId: a.deviceId, portId: a.id },
  b: { deviceId: b.deviceId, portId: b.id },
});

// The switch's first port runs to the second socket.
const floor = {
  devices,
  ports,
  cables: [cable(portOf("sw"), portOf("wall2"))],
};

describe("cableStart", () => {
  const press = (deviceId: string, n = 0) =>
    cableStart(
      { deviceId: id(deviceId), portId: portOf(deviceId, n).id },
      floor,
    );

  it("draws from a free port of a device cabled on the map", () => {
    expect(press("wall")).toEqual({ kind: "draw" });
    expect(press("pc")).toEqual({
      kind: "refused",
      reason: "Ce port ne se câble pas sur le plan.",
    });
  });

  it("offers to unplug a cable made by hand, from either end", () => {
    const unplug = {
      kind: "unplug",
      cable: floor.cables[0],
      label: "« Accès » 1 ↔ « Prise 2 » Avant 1",
    };
    expect(press("sw")).toEqual(unplug);
    expect(press("wall2")).toEqual({
      ...unplug,
      label: "« Prise 2 » Avant 1 ↔ « Accès » 1",
    });
  });

  it("leaves an integration's cable, and one to another floor, to the port table", () => {
    const netbox = {
      ...floor,
      cables: [
        {
          ...cable(portOf("sw"), portOf("wall2")),
          source: { integration: "netbox" as const, externalId: "7" },
        },
      ],
    };
    expect(
      cableStart({ deviceId: id("sw"), portId: portOf("sw").id }, netbox),
    ).toEqual({
      kind: "refused",
      reason:
        "Le câble de « Accès » 1 vient de NetBox : il ne se débranche pas dans NetPlan.",
    });

    // The socket's device is on another floor: not in this floor's document.
    const upstairs = {
      ...floor,
      devices: devices.filter(({ id: deviceId }) => deviceId !== "wall2"),
      ports: ports.filter(({ deviceId }) => deviceId !== "wall2"),
    };
    expect(
      cableStart({ deviceId: id("sw"), portId: portOf("sw").id }, upstairs),
    ).toEqual({
      kind: "refused",
      reason:
        "« Accès » 1 est câblé vers un autre étage : débranchez-le dans la table des ports.",
    });
  });
});

describe("cableDropResult", () => {
  const fromWall = { deviceId: id("wall"), portId: portOf("wall").id };

  it("cables the port it is dropped on, or refuses a cabled one", () => {
    expect(
      cableDropResult(
        fromWall,
        { deviceId: id("sw"), portId: portOf("sw", 3).id },
        floor,
      ),
    ).toEqual({ kind: "connect", port: portOf("sw", 3) });
    expect(
      cableDropResult(
        fromWall,
        { deviceId: id("sw"), portId: portOf("sw").id },
        floor,
      ),
    ).toEqual({ kind: "refused", reason: "« Accès » 1 est déjà câblé." });
  });

  it("lets the person pick among a device's free ports", () => {
    const result = cableDropResult(fromWall, { deviceId: id("sw") }, floor);
    expect(result.kind).toBe("pick");
    // 24 ports, one already cabled.
    expect(result.kind === "pick" && result.ports).toHaveLength(23);
  });

  it("cables a device's only free port at once", () => {
    const fromSwitch = { deviceId: id("sw"), portId: portOf("sw", 1).id };
    expect(
      cableDropResult(fromSwitch, { deviceId: id("wall") }, floor),
    ).toEqual({ kind: "connect", port: portOf("wall") });
    expect(
      cableDropResult(fromSwitch, { deviceId: id("wall2") }, floor),
    ).toEqual({
      kind: "refused",
      reason: "« Prise 2 » n'a plus de port libre.",
    });
  });

  it("does nothing off a device, on its own device, or on a PC", () => {
    expect(cableDropResult(fromWall, null, floor)).toEqual({ kind: "none" });
    expect(cableDropResult(fromWall, { deviceId: id("wall") }, floor)).toEqual({
      kind: "none",
    });
    expect(cableDropResult(fromWall, { deviceId: id("pc") }, floor)).toEqual({
      kind: "none",
    });
  });
});
