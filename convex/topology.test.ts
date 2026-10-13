import { describe, expect, it } from "bun:test";
import {
  normalizeNetworkDeviceName,
  normalizePortName,
  resolveLibreNmsTopology,
} from "./topology";
import type {
  PhysicalTopologyConnection,
  TopologyInventoryItem,
} from "./topology";

const inventory: Array<TopologyInventoryItem> = [
  {
    externalId: "device:pc",
    type: "pc",
    name: "ordi-86",
    macs: ["AA:BB:CC:DD:EE:FF"],
    cabledTerminationCount: 0,
  },
  {
    externalId: "device:socket",
    type: "wall-port",
    name: "2.2.4",
    macs: [],
    cabledTerminationCount: 1,
  },
  {
    externalId: "device:switch",
    type: "switch",
    name: "sw-access-01-1",
    macs: [],
    cabledTerminationCount: 1,
  },
];

const connection = (
  socketExternalId = "device:socket",
  switchPort = "GigabitEthernet1/0/18",
  sequence = 1,
): PhysicalTopologyConnection => ({
  externalId: `cable:${sequence}`,
  fromExternalId: socketExternalId,
  fromPort: "0",
  fromTerminationExternalId: `dcim.interface:socket-${sequence}`,
  fromTerminationKind: "interface",
  fromPeerTerminationExternalIds: [],
  toExternalId: "device:switch",
  toPort: switchPort,
  toTerminationExternalId: `dcim.interface:switch-${sequence}`,
  toTerminationKind: "interface",
  toPeerTerminationExternalIds: [],
});

const physicalConnections = [connection()];
const observedAt = "2026-07-20T10:00:00Z";

const resolve = (
  overrides: Partial<Parameters<typeof resolveLibreNmsTopology>[0]> = {},
) =>
  resolveLibreNmsTopology({
    inventory,
    physicalConnections,
    configuredSwitches: [
      { externalId: "4", networkName: "sw-access-01.as49028.net" },
    ],
    ports: [{ deviceId: 4, portId: 10, ifName: "Gi1/0/18" }],
    fdb: [
      {
        deviceId: 4,
        portId: 10,
        macAddress: "aabb.ccdd.eeff",
        updatedAt: observedAt,
      },
    ],
    lldp: [],
    syncedAt: Date.parse("2026-07-20T10:05:00Z"),
    ...overrides,
  });

describe("LibreNMS topology resolver", () => {
  it("normalizes stack member names and Cisco port names", () => {
    expect(normalizeNetworkDeviceName("sw-access-01-1")).toBe("sw-access-01");
    expect(normalizePortName("GigabitEthernet1/0/18")).toBe("gi1/0/18");
    expect(normalizePortName("Gi1/0/18")).toBe("gi1/0/18");
  });

  it("resolves an unambiguous FDB match and records LLDP confirmation", () => {
    const result = resolve({
      lldp: [
        {
          localDeviceId: 4,
          localPortId: 10,
          remoteHostname: "ordi-86.nousvoir.com",
        },
      ],
    });
    expect(result.discoveries).toHaveLength(1);
    expect(result.discoveries[0]).toMatchObject({
      computerExternalId: "device:pc",
      socketExternalId: "device:socket",
      method: "fdb+lldp",
      confidence: "high",
    });
  });

  it("retains all fresh socket candidates for an ambiguous computer", () => {
    const secondSocket: TopologyInventoryItem = {
      externalId: "device:socket-2",
      type: "wall-port",
      name: "2.2.5",
      macs: [],
      cabledTerminationCount: 1,
    };
    const result = resolve({
      inventory: [...inventory, secondSocket],
      physicalConnections: [
        ...physicalConnections,
        connection("device:socket-2", "GigabitEthernet1/0/19", 2),
      ],
      ports: [
        { deviceId: 4, portId: 10, ifName: "Gi1/0/18" },
        { deviceId: 4, portId: 11, ifName: "Gi1/0/19" },
      ],
      fdb: [10, 11].map((portId) => ({
        deviceId: 4,
        portId,
        macAddress: "AA:BB:CC:DD:EE:FF",
        updatedAt: observedAt,
      })),
    });
    expect(
      result.discoveries.map((item) => item.socketExternalId).sort(),
    ).toEqual(["device:socket", "device:socket-2"]);
  });

  it("never resolves LLDP without a fresh FDB observation", () => {
    const result = resolve({
      fdb: [],
      lldp: [
        {
          localDeviceId: 4,
          localPortId: 10,
          remoteHostname: "ordi-86.nousvoir.com",
        },
      ],
    });
    expect(result.discoveries).toEqual([]);
  });

  it("rejects FDB timestamps without an explicit UTC offset", () => {
    expect(
      resolve({
        fdb: [
          {
            deviceId: 4,
            portId: 10,
            macAddress: "AA:BB:CC:DD:EE:FF",
            updatedAt: "2026-07-20T10:00:00",
          },
        ],
      }).discoveries,
    ).toEqual([]);
  });

  it("diagnoses conflicting MAC inventory", () => {
    const result = resolve({
      inventory: [
        ...inventory,
        {
          externalId: "device:pc-duplicate",
          type: "pc",
          name: "duplicate",
          macs: ["AA:BB:CC:DD:EE:FF"],
          cabledTerminationCount: 0,
        },
      ],
    });
    expect(result.discoveries).toEqual([]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          computerExternalId: "device:pc",
          reason: "conflicting_mac_inventory",
          authoritative: true,
        }),
        expect.objectContaining({
          computerExternalId: "device:pc-duplicate",
          reason: "conflicting_mac_inventory",
          authoritative: true,
        }),
      ]),
    );
  });

  it("diagnoses an incomplete patch-panel path from explicit port peers", () => {
    const result = resolve({
      physicalConnections: [
        {
          externalId: "cable:patch-incomplete",
          fromExternalId: "device:switch",
          fromPort: "Gi1/0/18",
          fromTerminationExternalId: "dcim.interface:3",
          fromTerminationKind: "interface",
          fromPeerTerminationExternalIds: [],
          toExternalId: "device:patch-panel",
          toPort: "Rear 18",
          toTerminationExternalId: "dcim.rearport:18",
          toTerminationKind: "rear-port",
          toPeerTerminationExternalIds: ["dcim.frontport:18"],
        },
      ],
    });
    expect(result.discoveries).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ reason: "incomplete_patch_panel_path" }),
    );
  });

  it("resolves only a fully documented patch-panel path", () => {
    const result = resolve({
      physicalConnections: [
        {
          externalId: "cable:patch-switch",
          fromExternalId: "device:switch",
          fromPort: "Gi1/0/18",
          fromTerminationExternalId: "dcim.interface:3",
          fromTerminationKind: "interface",
          fromPeerTerminationExternalIds: [],
          toExternalId: "device:patch-panel",
          toPort: "Rear 18",
          toTerminationExternalId: "dcim.rearport:18",
          toTerminationKind: "rear-port",
          toPeerTerminationExternalIds: ["dcim.frontport:18"],
        },
        {
          externalId: "cable:patch-socket",
          fromExternalId: "device:patch-panel",
          fromPort: "Front 18",
          fromTerminationExternalId: "dcim.frontport:18",
          fromTerminationKind: "front-port",
          fromPeerTerminationExternalIds: ["dcim.rearport:18"],
          toExternalId: "device:socket",
          toPort: "0",
          toTerminationExternalId: "dcim.interface:2",
          toTerminationKind: "interface",
          toPeerTerminationExternalIds: [],
        },
      ],
    });
    expect(result.discoveries).toHaveLength(1);
    expect(result.discoveries[0]?.socketExternalId).toBe("device:socket");
    expect(result.discoveries[0]?.cablePathExternalIds).toEqual([
      "cable:patch-switch",
      "cable:patch-socket",
    ]);
  });

  it("diagnoses a socket with no cable as inventory evidence only", () => {
    const result = resolve({
      inventory: inventory.map((item) =>
        item.externalId === "device:socket"
          ? { ...item, cabledTerminationCount: 0 }
          : item,
      ),
      physicalConnections: [],
      fdb: [],
    });
    expect(result.diagnostics).toContainEqual({
      externalId: "netbox:device:socket:socket-without-cable",
      reason: "socket_without_cable",
      authoritative: false,
      socketExternalId: "device:socket",
    });
  });

  it("diagnoses an observed switch port absent from NetBox", () => {
    const result = resolve({
      ports: [{ deviceId: 4, portId: 99, ifName: "Gi1/0/99" }],
      fdb: [
        {
          deviceId: 4,
          portId: 99,
          macAddress: "AA:BB:CC:DD:EE:FF",
          updatedAt: observedAt,
        },
      ],
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ reason: "unknown_switch_port_in_netbox" }),
    );
  });

  it("diagnoses an observation from a switch absent from site configuration", () => {
    const result = resolve({
      configuredSwitches: [],
      ports: [{ deviceId: 9, portId: 10, ifName: "Gi1/0/18" }],
      fdb: [
        {
          deviceId: 9,
          portId: 10,
          macAddress: "AA:BB:CC:DD:EE:FF",
          updatedAt: observedAt,
          authoritative: false,
        },
      ],
    });
    expect(result.discoveries).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        reason: "switch_absent_from_site_configuration",
        authoritative: false,
      }),
    );
  });

  it("rejects MAC addresses that do not contain exactly six octets", () => {
    expect(
      resolve({
        fdb: [
          {
            deviceId: 4,
            portId: 10,
            macAddress: "AA:BB:CC:DD:EE",
            updatedAt: observedAt,
          },
        ],
      }).discoveries,
    ).toEqual([]);
  });

  it("keeps the deciding MAC paired with the latest observation", () => {
    const result = resolve({
      inventory: [
        {
          ...inventory[0],
          macs: [...inventory[0].macs, "11:22:33:44:55:66"],
        },
        ...inventory.slice(1),
      ],
      fdb: [
        {
          deviceId: 4,
          portId: 10,
          macAddress: "AA:BB:CC:DD:EE:FF",
          updatedAt: observedAt,
        },
        {
          deviceId: 4,
          portId: 10,
          macAddress: "11:22:33:44:55:66",
          updatedAt: "2026-07-20T10:01:00Z",
        },
      ],
    });
    expect(result.discoveries[0]).toMatchObject({
      computerMac: "112233445566",
      observedAt: Date.parse("2026-07-20T10:01:00Z"),
    });
  });
});
