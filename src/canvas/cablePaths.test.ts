import { describe, expect, it } from "bun:test";
import {
  cablePathOf,
  endLabels,
  floorCabling,
  mergedPaths,
  toggledCableDisplay,
} from "./cablePaths";
import type { FarEnd, SeenAt } from "./cablePaths";
import type {
  Cable,
  CableId,
  Device,
  DeviceId,
  Port,
  PortId,
} from "@/types/map";

type Kind = Port["kind"];

const port = (
  deviceId: string,
  kind: Kind,
  n: number,
  rear?: number,
): Port => ({
  id: `${deviceId}:${kind}${n}` as PortId,
  deviceId: deviceId as DeviceId,
  name: `${kind} ${n}`,
  kind,
  order: n,
  ...(rear === undefined
    ? {}
    : { rearPortId: `${deviceId}:rear${rear}` as PortId }),
});

const cable = (a: Port, b: Port): Cable => ({
  id: `${a.id}~${b.id}` as CableId,
  a: { deviceId: a.deviceId, portId: a.id },
  b: { deviceId: b.deviceId, portId: b.id },
});

const devices = (
  entries: Record<string, Device["type"]>,
): Array<Pick<Device, "id" | "type">> =>
  Object.entries(entries).map(([id, type]) => ({ id: id as DeviceId, type }));

const sw = port("sw", "interface", 1);
const pFront = port("p", "front", 1, 1);
const pRear = port("p", "rear", 1);
const wall = port("wall", "front", 1);
const pc = port("pc", "interface", 1);

const seenAtWall: SeenAt = {
  deviceId: "pc",
  socketId: "wall",
  socketName: "Prise",
  floorName: "RDC",
};

/**
 * A switch patched to a panel whose rear runs to a wall socket, and a PC the
 * network may locate at it.
 */
const floor = (
  ends: { seenAt?: Array<SeenAt>; farEnds?: Array<FarEnd> } = {},
  extra: { ports?: Array<Port>; cables?: Array<Cable> } = {},
) =>
  floorCabling(
    devices({ sw: "switch", p: "patch-panel", wall: "wall-port", pc: "pc" }),
    [sw, pFront, pRear, wall, pc, ...(extra.ports ?? [])],
    extra.cables ?? [cable(sw, pFront), cable(pRear, wall)],
    { seenAt: ends.seenAt ?? [], farEnds: ends.farEnds ?? [] },
  );

const id = (value: string) => value as DeviceId;
const hops = (path: ReturnType<typeof cablePathOf>) =>
  path.cables.map(({ from, to }) => `${from}>${to}`);

describe("cablePathOf", () => {
  it("follows a socket through its patch panel to the switch port", () => {
    const path = cablePathOf(id("wall"), floor());
    expect(hops(path)).toEqual(["wall>p", "p>sw"]);
    expect(path.ends).toEqual([
      { kind: "port", at: id("sw"), portName: "interface 1" },
    ]);
    expect(path.sightings).toEqual([]);
  });

  it("starts a located PC with a dashed segment to its socket", () => {
    expect(cablePathOf(id("pc"), floor()).cables).toEqual([]);

    const path = cablePathOf(id("pc"), floor({ seenAt: [seenAtWall] }));
    expect(path.sightings).toEqual([
      { deviceId: id("pc"), socketId: id("wall") },
    ]);
    expect(hops(path)).toEqual(["wall>p", "p>sw"]);

    // The socket shows the PC seen at it, and so does a trace that reaches
    // the socket.
    for (const from of ["wall", "sw"]) {
      expect(
        cablePathOf(id(from), floor({ seenAt: [seenAtWall] })).sightings,
      ).toEqual([{ deviceId: id("pc"), socketId: id("wall") }]);
    }
  });

  it("ends on a label where a cable or a sighting leaves the floor", () => {
    const away = port("upstairs", "interface", 1);
    const path = cablePathOf(
      id("wall"),
      floor(
        {
          farEnds: [
            {
              portId: away.id,
              portName: "Gi1/0/5",
              deviceId: "upstairs",
              deviceName: "SW-2",
              floorName: "Étage 2",
            },
          ],
        },
        { cables: [cable(pFront, wall), cable(pRear, away)] },
      ),
    );
    expect(path.ends).toEqual([
      {
        kind: "away",
        at: id("p"),
        deviceName: "SW-2",
        portName: "Gi1/0/5",
        floorName: "Étage 2",
      },
    ]);

    const elsewhere = cablePathOf(
      id("pc"),
      floor({
        seenAt: [
          {
            deviceId: "pc",
            socketId: "far-socket",
            socketName: "Prise 12",
            floorName: "Étage 3",
          },
        ],
      }),
    );
    expect(elsewhere.sightings).toEqual([]);
    expect(elsewhere.ends).toContainEqual({
      kind: "seen-away",
      at: id("pc"),
      socketName: "Prise 12",
      floorName: "Étage 3",
    });
  });

  it("stops at a rear port several front ports share", () => {
    const front2 = port("p", "front", 2, 1);
    const path = cablePathOf(
      id("sw"),
      floor(
        {},
        { ports: [front2], cables: [cable(sw, pRear), cable(pFront, wall)] },
      ),
    );
    expect(hops(path)).toEqual(["sw>p"]);
    expect(path.ends).toEqual([
      { kind: "shared", at: id("p"), portName: "rear 1" },
    ]);
  });

  it("names the port of a switch NetBox models with rear ports", () => {
    const swRear = port("sw", "rear", 7);
    const path = cablePathOf(
      id("wall"),
      floor(
        {},
        {
          ports: [swRear],
          cables: [cable(swRear, pFront), cable(pRear, wall)],
        },
      ),
    );
    expect(hops(path)).toEqual(["wall>p", "p>sw"]);
    expect(path.ends).toEqual([
      { kind: "port", at: id("sw"), portName: "rear 7" },
    ]);
  });

  it("draws a rear-to-rear cable and stops on a loop", () => {
    const qFront = port("q", "front", 1, 1);
    const qRear = port("q", "rear", 1);
    const rearToRear = floorCabling(
      devices({ sw: "switch", p: "patch-panel", q: "patch-panel" }),
      [sw, pFront, pRear, qFront, qRear],
      [cable(sw, pFront), cable(pRear, qRear)],
      { seenAt: [], farEnds: [] },
    );
    expect(hops(cablePathOf(id("sw"), rearToRear))).toEqual(["sw>p", "p>q"]);

    // Front to front and rear to rear: each way round comes back to where
    // it started, and each cable is drawn once.
    const loop = floorCabling(
      devices({ p: "patch-panel", q: "patch-panel" }),
      [pFront, pRear, qFront, qRear],
      [cable(pRear, qRear), cable(qFront, pFront)],
      { seenAt: [], farEnds: [] },
    );
    expect(hops(cablePathOf(id("p"), loop))).toEqual(["p>q", "q>p"]);
  });

  it("shows a patch panel's paths on both sides at once", () => {
    const path = cablePathOf(id("p"), floor({ seenAt: [seenAtWall] }));
    expect(hops(path).toSorted()).toEqual(["p>sw", "p>wall"]);
    expect(path.sightings).toEqual([
      { deviceId: id("pc"), socketId: id("wall") },
    ]);

    // Drawn with a hovered PC's path, each cable shows once.
    const merged = mergedPaths([
      path,
      cablePathOf(id("pc"), floor({ seenAt: [seenAtWall] })),
    ]);
    expect(merged.cables).toHaveLength(2);
    expect(merged.sightings).toHaveLength(1);
  });
});

describe("toggledCableDisplay", () => {
  const aSwitch = { id: id("sw"), type: "switch" } as const;
  const aPanel = { id: id("p"), type: "patch-panel" } as const;
  const aPc = { id: id("pc"), type: "pc" } as const;

  it("shows a switch or a patch panel, and hides it when asked again", () => {
    expect(toggledCableDisplay(null, aSwitch)).toBe(id("sw"));
    expect(toggledCableDisplay(id("sw"), aSwitch)).toBe(null);
    // Another switch's or panel's cables replace the shown ones.
    expect(toggledCableDisplay(id("sw"), aPanel)).toBe(id("p"));
  });

  it("hides on any other device, or on none", () => {
    expect(toggledCableDisplay(id("sw"), aPc)).toBe(null);
    expect(toggledCableDisplay(id("sw"), undefined)).toBe(null);
    expect(toggledCableDisplay(null, aPc)).toBe(null);
  });
});

describe("endLabels", () => {
  it("gathers the ports reached on one device into one label", () => {
    const portEnd = (n: number) =>
      ({ kind: "port", at: id("sw"), portName: `Gi1/0/${n}` }) as const;
    const away = {
      kind: "away",
      at: id("sw"),
      deviceName: "Cœur",
      portName: "Te1/1/1",
      floorName: null,
    } as const;
    expect(endLabels([portEnd(1), portEnd(2), away]).get(id("sw"))).toEqual([
      "Gi1/0/1, Gi1/0/2",
      "Cœur · Te1/1/1 (non placé)",
    ]);
    expect(endLabels([1, 2, 3, 4, 5].map(portEnd)).get(id("sw"))).toEqual([
      "5 ports",
    ]);
  });
});
