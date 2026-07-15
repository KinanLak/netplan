import { describe, expect, it } from "bun:test";
import {
  normalizeNetworkDeviceName,
  normalizePortName,
  resolveLibreNmsTopology,
} from "./topology";

const inventory = [
  {
    externalId: "device:pc",
    type: "pc" as const,
    name: "ordi-86",
    macs: ["AA:BB:CC:DD:EE:FF"],
  },
  {
    externalId: "device:socket",
    type: "wall-port" as const,
    name: "2.2.4",
    macs: [],
  },
  {
    externalId: "device:switch",
    type: "switch" as const,
    name: "sw-access-01-1",
    macs: [],
  },
];

const physicalConnections = [
  {
    fromExternalId: "device:socket",
    fromPort: "0",
    toExternalId: "device:switch",
    toPort: "GigabitEthernet1/0/18",
  },
];

describe("LibreNMS topology resolver", () => {
  it("normalizes stack member names and Cisco port names", () => {
    expect(normalizeNetworkDeviceName("sw-access-01-1")).toBe("sw-access-01");
    expect(normalizePortName("GigabitEthernet1/0/18")).toBe("gi1/0/18");
    expect(normalizePortName("Gi1/0/18")).toBe("gi1/0/18");
  });

  it("resolves an unambiguous FDB match and records LLDP confirmation", () => {
    const result = resolveLibreNmsTopology({
      inventory,
      physicalConnections,
      devices: [{ deviceId: 4, sysName: "sw-access-01.as49028.net" }],
      ports: [{ portId: 10, ifName: "Gi1/0/18" }],
      fdb: [
        {
          deviceId: 4,
          portId: 10,
          macAddress: "aabb.ccdd.eeff",
          updatedAt: "2026-07-11T10:00:00Z",
        },
      ],
      lldp: [
        {
          localDeviceId: 4,
          localPortId: 10,
          remoteHostname: "ordi-86.nousvoir.com",
        },
      ],
      syncedAt: Date.parse("2026-07-11T10:05:00Z"),
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      computerExternalId: "device:pc",
      socketExternalId: "device:socket",
      method: "fdb+lldp",
      confidence: "high",
    });
  });

  it("rejects a computer observed on several socket access ports", () => {
    const result = resolveLibreNmsTopology({
      inventory: [
        ...inventory,
        {
          externalId: "device:socket-2",
          type: "wall-port",
          name: "2.2.5",
          macs: [],
        },
      ],
      physicalConnections: [
        ...physicalConnections,
        {
          fromExternalId: "device:socket-2",
          fromPort: "0",
          toExternalId: "device:switch",
          toPort: "GigabitEthernet1/0/19",
        },
      ],
      devices: [{ deviceId: 4, sysName: "sw-access-01" }],
      ports: [
        { portId: 10, ifName: "Gi1/0/18" },
        { portId: 11, ifName: "Gi1/0/19" },
      ],
      fdb: [10, 11].map((portId) => ({
        deviceId: 4,
        portId,
        macAddress: "AA:BB:CC:DD:EE:FF",
      })),
      lldp: [],
      syncedAt: 1,
    });
    expect(result).toEqual([]);
  });
});
