import { describe, expect, it } from "bun:test";
import type { Device, DeviceId, FloorId } from "@/types/map";
import { materializeDocument } from "./materializeDocument";
import type { MapOperation } from "./types";

const floorId = "floor:a" as FloorId;
const deviceId = "device:a" as DeviceId;

const meta: MapOperation["meta"] = {
  opId: "op:test:0" as MapOperation["meta"]["opId"],
  clientId: "client:test" as MapOperation["meta"]["clientId"],
  clientSeq: 0,
  createdAt: 0,
};

const device: Device = {
  id: deviceId,
  floorId,
  type: "pc",
  name: "PC",
  position: { x: 10, y: 10 },
  size: { width: 80, height: 80 },
  metadata: {},
};

describe("materializeDocument", () => {
  it("reapplies pending operations over a stale server snapshot", () => {
    const visible = materializeDocument(
      { floorId, devices: [device], walls: [], links: [] },
      [
        {
          kind: "device.patch",
          meta,
          deviceId,
          patch: { position: { x: 100, y: 100 } },
        },
      ],
    );

    expect(visible.devices[0]?.position).toEqual({ x: 100, y: 100 });
  });
});
