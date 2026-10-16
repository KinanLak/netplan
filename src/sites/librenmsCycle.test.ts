import { describe, expect, it } from "bun:test";
import {
  edgeSightings,
  isOnline,
  matchPorts,
  readLastDiscovered,
  readLibreNMSFdb,
  readLibreNMSPorts,
  sightingSummary,
} from "./librenmsCycle";
import type { SwitchPort } from "./librenmsCycle";

describe("reading LibreNMS", () => {
  it("reads ports, forwarding entries and discovery times, ids as text too", () => {
    expect(
      readLibreNMSPorts({
        ports: [
          { port_id: 5, ifName: "Gi1/0/1", ifDescr: "GigabitEthernet1/0/1" },
          { port_id: "6", ifName: "", ifDescr: "Vlan10" },
          { ifName: "no-id" },
        ],
      }),
    ).toEqual([
      { id: 5, names: ["Gi1/0/1", "GigabitEthernet1/0/1"] },
      { id: 6, names: ["Vlan10"] },
    ]);
    expect(
      readLibreNMSFdb({
        ports_fdb: [
          { port_id: 5, mac_address: "1aaa2bbb3ccc" },
          { port_id: "6", mac_address: "not-a-mac" },
        ],
      }),
    ).toEqual([{ portId: 5, mac: "1a:aa:2b:bb:3c:cc" }]);
    // A single entry comes as an object.
    expect(
      readLibreNMSFdb({
        ports_fdb: { port_id: 7, mac_address: "AABBCCDDEEFF" },
      }),
    ).toEqual([{ portId: 7, mac: "aa:bb:cc:dd:ee:ff" }]);
    expect(readLibreNMSFdb({ status: "ok" })).toEqual([]);
    expect(
      readLastDiscovered({
        devices: [{ last_discovered: "2026-10-16 07:00:00" }],
      }),
    ).toBe("2026-10-16 07:00:00");
    expect(
      readLastDiscovered({ devices: [{ last_discovered: null }] }),
    ).toBeNull();
  });
});

describe("matchPorts", () => {
  const inventory = [
    { id: "a1", name: "GigabitEthernet1/0/1" },
    { id: "a2", name: "Gi1/0/2" },
    { id: "b1", name: "TenGigabitEthernet1/1/1" },
    { id: "c1", name: "Port 7" },
  ];

  it("matches exactly, case aside, then by an abbreviated leading word", () => {
    const matched = matchPorts(
      [
        { id: 1, names: ["gi1/0/1"] },
        { id: 2, names: ["GigabitEthernet1/0/2"] },
        { id: 3, names: ["Te1/1/1"] },
        { id: 4, names: ["port 7"] },
        { id: 5, names: ["Gi1/0/9"] },
      ],
      inventory,
    );
    expect([...matched]).toEqual([
      [1, "a1"],
      [2, "a2"],
      [3, "b1"],
      [4, "c1"],
    ]);
  });

  it("matches nothing when the name is ambiguous or claimed twice", () => {
    const stack = [
      { id: "s1", name: "Gi1/0/1" },
      { id: "s2", name: "gi1/0/1" },
      { id: "t1", name: "Ethernet1" },
    ];
    expect(
      matchPorts(
        [
          { id: 1, names: ["Gi1/0/1"] },
          { id: 2, names: ["Eth1"] },
          { id: 3, names: ["Et1"] },
          // Numbers alone abbreviate nothing.
          { id: 4, names: ["1"] },
        ],
        stack,
      ).size,
    ).toBe(0);
  });
});

describe("edgeSightings", () => {
  const port = (
    id: string,
    socketId: string | null,
    cabled: boolean,
  ): SwitchPort => ({ id, switchId: "sw", name: id, socketId, cabled });
  const ports = [
    port("to-socket", "socket", true),
    port("uplink", null, true),
    port("loose", null, false),
    port("busy", null, false),
  ];
  const matched = new Map([
    [1, "to-socket"],
    [2, "uplink"],
    [3, "loose"],
    [4, "busy"],
  ]);
  const mac = (n: number) => `00:00:00:00:00:${String(n).padStart(2, "0")}`;

  it("counts ports that reach a socket and quiet uncabled ones", () => {
    const fdb = [
      { portId: 1, mac: mac(1) },
      { portId: 2, mac: mac(2) },
      { portId: 3, mac: mac(3) },
      ...[10, 11, 12, 13, 14].map((n) => ({ portId: 4, mac: mac(n) })),
      { portId: 99, mac: mac(99) },
    ];
    expect(edgeSightings(fdb, matched, ports)).toEqual([
      { mac: mac(1), portId: "to-socket", switchId: "sw", socketId: "socket" },
      { mac: mac(3), portId: "loose", switchId: "sw" },
    ]);
  });

  it("prefers the port at a socket for a MAC seen on two", () => {
    const fdb = [
      { portId: 3, mac: mac(1) },
      { portId: 1, mac: mac(1) },
    ];
    expect(edgeSightings(fdb, matched, ports)).toEqual([
      { mac: mac(1), portId: "to-socket", switchId: "sw", socketId: "socket" },
    ]);
  });
});

describe("presence", () => {
  it("is online while one MAC missed fewer than two cycles", () => {
    expect(isOnline([0])).toBe(true);
    expect(isOnline([2, 1])).toBe(true);
    expect(isOnline([2, 3])).toBe(false);
    expect(isOnline([])).toBe(false);
  });

  it("summarises a read", () => {
    expect(
      sightingSummary({
        switches: 1,
        seen: 1,
        online: 0,
        offline: 0,
        unknown: 0,
      }),
    ).toBe("1 switch lu, 1 MAC vue.");
    expect(
      sightingSummary({
        switches: 2,
        seen: 9,
        online: 2,
        offline: 1,
        unknown: 3,
      }),
    ).toBe(
      "2 switchs lus, 9 MAC vues (2 passés en ligne, 1 passé hors ligne, 3 inconnues).",
    );
  });
});
