import { describe, expect, it } from "bun:test";
import { traceFrom } from "./ports";
import type { TracePort } from "./ports";

/** A site as plain maps: each cable both ways, and the socket devices. */
const site = (
  ports: Array<TracePort>,
  cables: Array<[string, string]>,
  sockets: Array<string> = [],
) => {
  const byId = new Map(ports.map((port) => [port.id, port]));
  const far = new Map<string, string>();
  for (const [a, b] of cables) {
    far.set(a, b);
    far.set(b, a);
  }
  const at = (id: string | undefined) =>
    Promise.resolve(id === undefined ? undefined : byId.get(id));
  return {
    cabledTo: (portId: string) => at(far.get(portId)),
    portOf: (portId: string) => at(portId),
    frontOf: (rearPortId: string) =>
      Promise.resolve(ports.find((port) => port.rearPortId === rearPortId)),
    isSocket: (deviceId: string) => Promise.resolve(sockets.includes(deviceId)),
  };
};

const iface = (deviceId: string): TracePort => ({
  id: `${deviceId}:if`,
  deviceId,
  kind: "interface",
});
const panel = (deviceId: string, n: number): Array<TracePort> => [
  {
    id: `${deviceId}:front${n}`,
    deviceId,
    kind: "front",
    rearPortId: `${deviceId}:rear${n}`,
  },
  { id: `${deviceId}:rear${n}`, deviceId, kind: "rear" },
];
const socket: TracePort = {
  id: "socket:front",
  deviceId: "socket",
  kind: "front",
};

const ids = (ports: Array<TracePort>) => ports.map((port) => port.id);

describe("traceFrom", () => {
  it("crosses patch panels both ways and stops at the socket", async () => {
    const ports = [iface("sw"), ...panel("p1", 1), ...panel("p2", 1), socket];
    const cabling = site(
      ports,
      [
        ["sw:if", "p1:rear1"],
        ["p1:front1", "p2:rear1"],
        ["p2:front1", "socket:front"],
      ],
      ["socket"],
    );

    expect(ids(await traceFrom(iface("sw"), cabling))).toEqual([
      "p1:rear1",
      "p2:rear1",
      "socket:front",
    ]);
    expect(ids(await traceFrom(socket, cabling))).toEqual([
      "p2:front1",
      "p1:front1",
      "sw:if",
    ]);
  });

  it("stops at an uncabled port, an interface, or a socket with a rear port", async () => {
    const ports = [iface("sw"), ...panel("p1", 1), ...panel("jack", 1)];
    expect(
      ids(await traceFrom(iface("sw"), site(ports, [["sw:if", "p1:rear1"]]))),
    ).toEqual(["p1:rear1"]);
    expect(await traceFrom(iface("sw"), site(ports, []))).toEqual([]);
    expect(
      ids(
        await traceFrom(
          iface("sw"),
          site(
            ports,
            [
              ["sw:if", "p1:rear1"],
              ["p1:front1", "jack:front1"],
            ],
            ["jack"],
          ),
        ),
      ),
    ).toEqual(["p1:rear1", "jack:front1"]);
  });

  it("stops where a miscabled panel leads back on itself", async () => {
    const ports = [iface("sw"), ...panel("p", 1), ...panel("p", 2)];
    const cabling = site(ports, [
      ["sw:if", "p:rear1"],
      ["p:front1", "p:rear2"],
      ["p:front2", "p:rear1"],
    ]);
    expect(ids(await traceFrom(iface("sw"), cabling))).toEqual([
      "p:rear1",
      "p:rear2",
    ]);
  });
});
