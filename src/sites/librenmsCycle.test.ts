import { describe, expect, it } from "bun:test";
import {
  edgeSightings,
  freshFdb,
  isOnline,
  matchPorts,
  readLastDiscovered,
  readLibreNMSFdb,
  readLibreNMSPorts,
  readLibreNMSTime,
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
          {
            port_id: 5,
            mac_address: "1aaa2bbb3ccc",
            updated_at: "2019-01-1 01:01:01",
          },
          { port_id: "6", mac_address: "not-a-mac" },
        ],
      }),
    ).toEqual([
      {
        portId: 5,
        mac: "1a:aa:2b:bb:3c:cc",
        updatedAt: Date.UTC(2019, 0, 1, 1, 1, 1),
      },
    ]);
    // A single entry comes as an object.
    expect(
      readLibreNMSFdb({
        ports_fdb: { port_id: 7, mac_address: "AABBCCDDEEFF" },
      }),
    ).toEqual([{ portId: 7, mac: "aa:bb:cc:dd:ee:ff", updatedAt: null }]);
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

describe("freshFdb", () => {
  const entry = (n: number, updatedAt: string | null) => ({
    portId: n,
    mac: `00:00:00:00:00:0${n}`,
    updatedAt: readLibreNMSTime(updatedAt),
  });
  const table = [
    entry(1, "2026-10-16 07:00:40"),
    entry(2, "2026-10-16 07:00:02"),
    // Left behind by the discovery five minutes earlier.
    entry(3, "2026-10-16 06:55:30"),
    entry(4, null),
  ];
  const newest = Date.UTC(2026, 9, 16, 7, 0, 40);
  const ports = (read: { fresh: Array<{ portId: number }> }) =>
    read.fresh.map(({ portId }) => portId);

  it("keeps what the latest discovery refreshed", () => {
    const first = freshFdb(table, { newest: undefined, discovered: true });
    expect(ports(first)).toEqual([1, 2]);
    expect(first.newest).toBe(newest);
    // Read again before the next discovery: the same entries.
    expect(ports(freshFdb(table, { newest, discovered: false }))).toEqual([
      1, 2,
    ]);
    // Without timestamps nothing can be told apart.
    expect(
      freshFdb([entry(1, null), entry(2, null)], {
        newest: undefined,
        discovered: true,
      }).fresh,
    ).toHaveLength(2);
  });

  it("sees nothing once a discovery refreshed nothing", () => {
    expect(ports(freshFdb(table, { newest, discovered: true }))).toEqual([]);
  });

  it("reads timestamps with or without a zone", () => {
    expect(readLibreNMSTime("2026-10-16T05:00:00.000000Z")).toBe(
      Date.UTC(2026, 9, 16, 5),
    );
    expect(readLibreNMSTime("2026-10-16 07:00:00+02:00")).toBe(
      Date.UTC(2026, 9, 16, 5),
    );
    expect(readLibreNMSTime("2026-10-16 7:00:00")).toBe(
      Date.UTC(2026, 9, 16, 7),
    );
    expect(readLibreNMSTime("hier")).toBeNull();
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
      { portId: 1, mac: mac(1), updatedAt: null },
      { portId: 2, mac: mac(2), updatedAt: null },
      { portId: 3, mac: mac(3), updatedAt: null },
      ...[10, 11, 12, 13, 14].map((n) => ({
        portId: 4,
        mac: mac(n),
        updatedAt: null,
      })),
      { portId: 99, mac: mac(99), updatedAt: null },
    ];
    expect(edgeSightings(fdb, matched, ports)).toEqual([
      { mac: mac(1), portId: "to-socket", switchId: "sw", socketId: "socket" },
      { mac: mac(3), portId: "loose", switchId: "sw" },
    ]);
  });

  it("prefers the port at a socket for a MAC seen on two", () => {
    const fdb = [
      { portId: 3, mac: mac(1), updatedAt: null },
      { portId: 1, mac: mac(1), updatedAt: null },
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
