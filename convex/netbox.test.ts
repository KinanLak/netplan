import { describe, expect, it } from "bun:test";
import { parsePhysicalConnections } from "./netbox";

const termination = (
  objectType: string,
  id: number,
  deviceId: number,
  name: string,
) => [
  {
    object_type: objectType,
    object: { id, device: { id: deviceId }, name },
  },
];

describe("NetBox physical connection parsing", () => {
  it("retains explicit front/rear patch-panel evidence without inventory devices", () => {
    const connections = parsePhysicalConnections(
      [
        {
          id: 1,
          a_terminations: termination("dcim.interface", 100, 3, "Gi1/0/18"),
          b_terminations: termination("dcim.rearport", 30, 9, "Rear 18"),
        },
        {
          id: 2,
          a_terminations: termination("dcim.frontport", 20, 9, "Front 18"),
          b_terminations: termination("dcim.interface", 200, 2, "0"),
        },
      ],
      [{ id: 20, rear_port: { id: 30 } }],
    );

    expect(connections).toHaveLength(2);
    expect(connections[0]).toMatchObject({
      fromExternalId: "device:3",
      fromTerminationExternalId: "dcim.interface:100",
      fromTerminationKind: "interface",
      toExternalId: "device:9",
      toTerminationExternalId: "dcim.rearport:30",
      toTerminationKind: "rear-port",
      toPeerTerminationExternalIds: ["dcim.frontport:20"],
    });
    expect(connections[1]).toMatchObject({
      fromExternalId: "device:9",
      fromTerminationExternalId: "dcim.frontport:20",
      fromTerminationKind: "front-port",
      fromPeerTerminationExternalIds: ["dcim.rearport:30"],
      toExternalId: "device:2",
    });
  });
});
