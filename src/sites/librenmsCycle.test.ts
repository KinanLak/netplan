import { describe, expect, it } from "bun:test";
import {
  adoptedPorts,
  edgeSightings,
  ethernetNames,
  portPresence,
  freshFdb,
  isOnline,
  matchPorts,
  newestFdbEntry,
  readLastDiscovered,
  readLibreNMSDeviceStatus,
  readLibreNMSFdb,
  readLibreNMSPorts,
  readLibreNMSTime,
  readStaleAfterMs,
  sightingSummary,
  portMoves,
  clearlyNewest,
  socketMoves,
  socketSightings,
} from "./librenmsCycle";
import type { OwnPort, SwitchPort } from "./librenmsCycle";

describe("reading LibreNMS", () => {
  it("reads ports, forwarding entries and discovery times, ids as text too", () => {
    expect(
      readLibreNMSPorts({
        ports: [
          {
            port_id: 5,
            ifIndex: "10101",
            ifName: "Gi1/0/1",
            ifDescr: "GigabitEthernet1/0/1",
            ifType: "ethernetCsmacd",
            ifOperStatus: "up",
          },
          {
            port_id: "6",
            ifIndex: 10,
            ifName: "",
            ifDescr: "Vlan10",
            ifType: "l3ipvlan",
          },
          { port_id: 7, ifName: "Gi1/0/2", ifOperStatus: "lowerLayerDown" },
          { port_id: 8, ifName: "Gi1/0/3", ifOperStatus: "unknown" },
          { ifName: "no-id" },
        ],
      }),
    ).toEqual([
      {
        id: 5,
        names: ["Gi1/0/1", "GigabitEthernet1/0/1"],
        link: "up",
        ethernetIndex: 10101,
      },
      { id: 6, names: ["Vlan10"] },
      { id: 7, names: ["Gi1/0/2"], link: "down" },
      { id: 8, names: ["Gi1/0/3"] },
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

  it("reads whether LibreNMS reaches a device, whatever the number's type", () => {
    const of = (status: unknown) =>
      readLibreNMSDeviceStatus({ devices: [{ device_id: 7, status }] });
    expect([1, "1", true].map(of)).toEqual(["up", "up", "up"]);
    expect([0, "0", false].map(of)).toEqual(["down", "down", "down"]);
    expect([null, 2, "up"].map(of)).toEqual([null, null, null]);
    expect(readLibreNMSDeviceStatus({ status: "ok" })).toBeNull();
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
    const first = freshFdb(table, undefined, "finished");
    expect(ports(first)).toEqual([1, 2]);
    expect(first.table).toEqual({ newest });
    // Read again before the next discovery: the same entries.
    expect(ports(freshFdb(table, { newest }, "none"))).toEqual([1, 2]);
    // Without timestamps nothing can be told apart.
    expect(
      freshFdb([entry(1, null), entry(2, null)], undefined, "finished").fresh,
    ).toHaveLength(2);
  });

  it("sees nothing once a discovery refreshed nothing, until one does", () => {
    const stale = freshFdb(table, { newest }, "finished");
    expect(ports(stale)).toEqual([]);
    expect(stale.table).toEqual({ newest, staleUpTo: newest });
    // A read without a discovery remembers it.
    expect(ports(freshFdb(table, stale.table ?? undefined, "none"))).toEqual(
      [],
    );
    // A later discovery refreshes one entry.
    const refreshed = [entry(5, "2026-10-16 07:10:00"), ...table];
    expect(
      ports(freshFdb(refreshed, stale.table ?? undefined, "finished")),
    ).toEqual([5]);
  });

  it("says a table is not refreshed from a missed discovery until one finishes", () => {
    const missed = freshFdb(table, { newest }, "missed");
    // Counted as it was: a busy LibreNMS does not take devices offline.
    expect(ports(missed)).toEqual([1, 2]);
    expect(missed.table).toEqual({ newest, unrefreshed: true });
    // A read without a discovery keeps saying it.
    expect(freshFdb(table, missed.table ?? undefined, "none").table).toEqual({
      newest,
      unrefreshed: true,
    });
    // A finished discovery, or a table that moved, clears it.
    expect(
      freshFdb(table, missed.table ?? undefined, "finished").table?.unrefreshed,
    ).toBeUndefined();
    const moved = [entry(5, "2026-10-16 07:10:00"), ...table];
    expect(
      freshFdb(moved, missed.table ?? undefined, "none").table?.unrefreshed,
    ).toBeUndefined();
  });

  it("sees nothing on a first read when the discovery left the table as it was", () => {
    // Recorded from a Nexus whose discoveries stopped refreshing its table,
    // before and after one; MACs and port ids replaced, timestamps and fields
    // as LibreNMS 26.9.1 answered.
    const fdb = {
      status: "ok",
      ports_fdb: [
        ["00:00:5e:00:53:01", "2026-10-13T12:00:27.000000Z"],
        ["00:00:5e:00:53:02", "2026-10-13T12:00:26.000000Z"],
        ["00:00:5e:00:53:03", "2026-10-12T06:00:26.000000Z"],
      ].map(([mac_address, updated_at], index) => ({
        ports_fdb_id: index + 1,
        port_id: 100 + index,
        mac_address,
        vlan_id: 1,
        device_id: 2,
        created_at: "2026-10-09T12:00:35.000000Z",
        updated_at,
      })),
    };
    const entries = readLibreNMSFdb(fdb);
    const recorded = Date.UTC(2026, 9, 13, 12, 0, 27);
    expect(newestFdbEntry(entries)).toBe(recorded);

    const first = freshFdb(entries, { newest: recorded }, "finished");
    expect(first.fresh).toEqual([]);
    expect(first.table).toEqual({ newest: recorded, staleUpTo: recorded });
    // A table the discovery refreshed is read as before.
    expect(
      ports(
        freshFdb(
          table,
          { newest: Date.UTC(2026, 9, 16, 6, 55, 30) },
          "finished",
        ),
      ),
    ).toEqual([1, 2]);
    expect(newestFdbEntry([entry(1, null)])).toBeNull();
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

describe("adopting LibreNMS's port names", () => {
  it("takes the Ethernet ports' names, by interface index", () => {
    expect(
      ethernetNames([
        { id: 1, names: ["Gi1/0/2", "GigabitEthernet1/0/2"], ethernetIndex: 2 },
        { id: 2, names: ["Vl1"] },
        { id: 3, names: [" Gi1/0/1 "], ethernetIndex: 1 },
        { id: 4, names: [], ethernetIndex: 3 },
      ]),
    ).toEqual(["Gi1/0/1", "Gi1/0/2", ""]);
  });

  const defaults = (count: number, cabled: Array<number> = []) =>
    Array.from({ length: count }, (_, i): OwnPort => ({
      id: `port:sw:interface:${i + 1}`,
      name: String(i + 1),
      kind: "interface",
      order: i + 1,
      cabled: cabled.includes(i + 1),
      sourced: false,
    }));

  it("renames ports by position and drops the uncabled ones LibreNMS lacks", () => {
    expect(adoptedPorts("sw", defaults(4, [4]), ["Gi1", "Gi2"])).toEqual({
      rename: [
        { id: "port:sw:interface:1", name: "Gi1" },
        { id: "port:sw:interface:2", name: "Gi2" },
      ],
      add: [],
      remove: ["port:sw:interface:3"],
    });
  });

  it("adds the ports LibreNMS has beyond, with ids no port has", () => {
    const [first, second] = defaults(2);
    const own = [first, { ...second, id: "port:sw:interface:3" }];
    expect(adoptedPorts("sw", own, ["a", "b", "c"])).toEqual({
      rename: [
        { id: "port:sw:interface:1", name: "a" },
        { id: "port:sw:interface:3", name: "b" },
      ],
      add: [{ id: "port:sw:interface:4", name: "c", order: 3 }],
      remove: [],
    });
  });

  it("leaves ports a person or a source named", () => {
    const [first, ...rest] = defaults(3);
    expect(
      adoptedPorts("sw", [{ ...first, name: "uplink" }, ...rest], ["a"]),
    ).toBeNull();
    expect(
      adoptedPorts("sw", [{ ...first, sourced: true }, ...rest], ["a"]),
    ).toBeNull();
    expect(adoptedPorts("sw", defaults(3).slice(1), ["a"])).toBeNull();
  });

  it("adopts nothing LibreNMS cannot name each port with once", () => {
    expect(adoptedPorts("sw", defaults(2), [])).toBeNull();
    // An unnamed port would shift every name after it.
    expect(adoptedPorts("sw", defaults(2), ["", "Gi2"])).toBeNull();
    expect(adoptedPorts("sw", defaults(2), ["Gi1", "gi1"])).toBeNull();
    expect(adoptedPorts("sw", defaults(2), ["x".repeat(65)])).toBeNull();
    expect(adoptedPorts("sw", [], ["a"])).toBeNull();
  });
});

describe("edgeSightings", () => {
  const port = (
    id: string,
    socketId: string | null,
    cabled: boolean,
    endId: string | null = socketId,
  ): SwitchPort => ({ id, switchId: "sw", name: id, socketId, endId, cabled });
  const ports = [
    port("to-socket", "socket", true),
    port("uplink", null, true, "core"),
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

  it("places a MAC behind two sockets at the one LibreNMS refreshed last, and lists both", () => {
    const twoSockets = [
      port("to-socket", "socket", true),
      port("to-other", "other", true),
    ];
    const both = new Map([
      [1, "to-socket"],
      [5, "to-other"],
    ]);
    const fdb = [
      { portId: 1, mac: mac(1), updatedAt: 1_000 },
      { portId: 5, mac: mac(1), updatedAt: 500_000 },
    ];
    expect(edgeSightings(fdb, both, twoSockets)).toEqual([
      { mac: mac(1), portId: "to-other", switchId: "sw", socketId: "other" },
    ]);
    expect(socketSightings(fdb, both, twoSockets)).toEqual([
      { mac: mac(1), socketId: "socket", updatedAt: 1_000 },
      { mac: mac(1), socketId: "other", updatedAt: 500_000 },
    ]);
    // An undated table says nothing of when.
    expect(
      socketSightings(
        [{ portId: 1, mac: mac(1), updatedAt: null }],
        both,
        twoSockets,
      ),
    ).toEqual([{ mac: mac(1), socketId: "socket" }]);
  });

  it("tells where a device may be behind a port, apart from where to place it", () => {
    const fdb = [
      { portId: 3, mac: mac(1), updatedAt: null },
      { portId: 1, mac: mac(1), updatedAt: null },
      { portId: 2, mac: mac(2), updatedAt: null },
      ...[10, 11, 12, 13, 14].map((n) => ({
        portId: 4,
        mac: mac(n),
        updatedAt: null,
      })),
    ];
    expect(portPresence(fdb, matched, ports)).toEqual([
      { portId: "loose", macs: [mac(1)] },
      { portId: "to-socket", macs: [mac(1)] },
      { portId: "uplink", macs: [mac(2)], deviceId: "core" },
    ]);
  });
});

describe("readStaleAfterMs", () => {
  it("vouches for a read two intervals and a lease, 25 minutes by default", () => {
    expect(readStaleAfterMs(5, 15 * 60_000)).toBe(25 * 60_000);
    expect(readStaleAfterMs(60, 15 * 60_000)).toBe(135 * 60_000);
  });
});

describe("presence", () => {
  it("is online while one MAC missed fewer than two cycles", () => {
    expect(isOnline([0])).toBe(true);
    expect(isOnline([2, 1])).toBe(true);
    expect(isOnline([2, 3])).toBe(false);
    expect(isOnline([])).toBe(false);
  });

  it("moves a device by where any of its MACs was last seen", () => {
    const owners = new Map([
      ["mac-a", { id: "pc", placed: true }],
      ["mac-b", { id: "pc", placed: true }],
    ]);
    const atA = [{ ownerId: "pc", socketId: "socket-a", seenAt: 1 }];
    const moves = (
      seen: Parameters<typeof socketMoves>[0],
      history: Parameters<typeof socketMoves>[2] = atA,
    ) => [...socketMoves(seen, owners, history).moves];
    // Seen through its other interface at another socket.
    expect(moves([{ mac: "mac-b", socketId: "socket-b" }])).toEqual([
      ["pc", "socket-b"],
    ]);
    // Still where its latest sighting saw it, through either MAC.
    expect(
      moves([
        { mac: "mac-b", socketId: "socket-b" },
        { mac: "mac-a", socketId: "socket-a" },
      ]),
    ).toEqual([]);
    // Back at a socket an older sighting saw it at.
    expect(
      moves(
        [{ mac: "mac-a", socketId: "socket-a" }],
        [...atA, { ownerId: "pc", socketId: "socket-b", seenAt: 2 }],
      ),
    ).toEqual([["pc", "socket-a"]]);
    // Seen for the first time: a person's place stays.
    expect(moves([{ mac: "mac-a", socketId: "socket-a" }], [])).toEqual([]);
    // The place follows what the cycle decided, not what the row saw.
    expect(
      moves(
        [{ mac: "mac-a", socketId: "socket-a" }],
        [
          {
            ownerId: "pc",
            socketId: "socket-a",
            decided: { socketId: "socket-b" },
            seenAt: 1,
          },
        ],
      ),
    ).toEqual([["pc", "socket-a"]]);
  });

  it("moves a device seen at several new sockets to the one clearly refreshed last, else holds it", () => {
    const owners = new Map([
      ["mac-a", { id: "pc", placed: true }],
      ["mac-b", { id: "pc", placed: true }],
    ]);
    const atOld = [{ ownerId: "pc", socketId: "socket-old", seenAt: 1 }];
    const minute = 60_000;
    const decide = (
      seen: Parameters<typeof socketMoves>[0],
      history: Parameters<typeof socketMoves>[2] = atOld,
    ) => {
      const { moves, kept, held } = socketMoves(seen, owners, history);
      return { moves: [...moves], kept: [...kept], held: [...held] };
    };
    // Three minutes apart: more than one cycle's discoveries.
    expect(
      decide([
        { mac: "mac-a", socketId: "socket-b", updatedAt: 10 * minute },
        { mac: "mac-b", socketId: "socket-c", updatedAt: 13 * minute },
      ]),
    ).toEqual({ moves: [["pc", "socket-c"]], kept: [], held: [] });
    // One MAC behind two sockets, the same way.
    expect(
      decide([
        { mac: "mac-a", socketId: "socket-b", updatedAt: 13 * minute },
        { mac: "mac-a", socketId: "socket-c", updatedAt: 10 * minute },
      ]),
    ).toEqual({ moves: [["pc", "socket-b"]], kept: [], held: [] });
    // About as recent, or undated: it stays where it is.
    expect(
      decide([
        { mac: "mac-a", socketId: "socket-b", updatedAt: 10 * minute },
        { mac: "mac-b", socketId: "socket-c", updatedAt: 11 * minute },
      ]),
    ).toEqual({ moves: [], kept: [], held: ["pc"] });
    expect(
      decide([
        { mac: "mac-a", socketId: "socket-b" },
        { mac: "mac-b", socketId: "socket-c", updatedAt: 11 * minute },
      ]),
    ).toEqual({ moves: [], kept: [], held: ["pc"] });
    // One of them is where its place follows: nothing to decide.
    expect(
      decide([
        { mac: "mac-a", socketId: "socket-old", updatedAt: 10 * minute },
        { mac: "mac-b", socketId: "socket-c", updatedAt: 13 * minute },
      ]),
    ).toEqual({ moves: [], kept: [["pc", "socket-old"]], held: [] });
  });

  it("places an unplaced device at a socket it was seen at before, else by the same rule", () => {
    const owners = new Map([
      ["mac-a", { id: "pc", placed: false }],
      ["mac-b", { id: "pc", placed: false }],
    ]);
    const seen = [
      { mac: "mac-b", socketId: "socket-b" },
      { mac: "mac-a", socketId: "socket-a" },
    ];
    expect([
      ...socketMoves(seen, owners, [
        { ownerId: "pc", socketId: "socket-a", seenAt: 1 },
      ]).moves,
    ]).toEqual([["pc", "socket-a"]]);
    // Never seen, at two undated sockets: it stays off the plan.
    expect(socketMoves(seen, owners, [])).toEqual({
      moves: new Map(),
      kept: new Map(),
      held: new Set(["pc"]),
    });
    // Held before, with no place decided: the socket it was seen at then is
    // not a known one.
    expect(
      socketMoves(seen, owners, [
        { ownerId: "pc", socketId: "socket-a", decided: {}, seenAt: 1 },
      ]).held,
    ).toEqual(new Set(["pc"]));
    expect([
      ...socketMoves([{ mac: "mac-b", socketId: "socket-b" }], owners, [])
        .moves,
    ]).toEqual([["pc", "socket-b"]]);
  });

  it("names a clearly newest socket only past one cycle's spread", () => {
    const minute = 60_000;
    expect(clearlyNewest(new Map([["a", null]]))).toBe("a");
    expect(
      clearlyNewest(
        new Map([
          ["a", 0],
          ["b", 2 * minute + 1],
        ]),
      ),
    ).toBe("b");
    expect(
      clearlyNewest(
        new Map([
          ["a", 0],
          ["b", 2 * minute],
        ]),
      ),
    ).toBeNull();
  });

  it("records a device as located when first seen or seen on another port", () => {
    const owners = new Map([
      ["mac-a", { id: "pc" }],
      ["mac-b", { id: "pc" }],
    ]);
    const onA = { mac: "mac-a", portId: "port-a", switchId: "sw" };
    const onB = { mac: "mac-b", portId: "port-b", switchId: "sw" };
    // Never seen before.
    expect([...portMoves([onA], owners, [])]).toEqual([
      ["pc", { seen: onA, first: true }],
    ]);
    const atA = [{ ownerId: "pc", portId: "port-a", seenAt: 1 }];
    // Still on a port its latest sighting saw, through either MAC.
    expect(portMoves([onB, onA], owners, atA).size).toBe(0);
    // Only on another port: located there.
    expect([...portMoves([onB], owners, atA)]).toEqual([
      ["pc", { seen: onB, first: false }],
    ]);
    // Back on a port an older sighting saw.
    expect([
      ...portMoves([onA], owners, [
        ...atA,
        { ownerId: "pc", portId: "port-b", seenAt: 2 },
      ]),
    ]).toEqual([["pc", { seen: onA, first: false }]]);
    // A MAC no device carries records nothing.
    expect(portMoves([{ ...onA, mac: "mac-x" }], owners, []).size).toBe(0);
  });

  it("summarises a read", () => {
    expect(
      sightingSummary({
        switches: 1,
        seen: 1,
        online: 0,
        offline: 0,
        placed: 0,
        unknown: 0,
      }),
    ).toBe("1 switch lu, 1 MAC vue.");
    expect(
      sightingSummary({
        switches: 2,
        seen: 9,
        online: 2,
        offline: 1,
        placed: 1,
        unknown: 3,
      }),
    ).toBe(
      "2 switchs lus, 9 MAC vues (2 passés en ligne, 1 passé hors ligne, 1 placé près de sa prise, 3 inconnues).",
    );
  });
});
