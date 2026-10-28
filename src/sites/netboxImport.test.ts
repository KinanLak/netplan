import { describe, expect, it } from "bun:test";
import {
  absencePurgeDue,
  importedName,
  importSummary,
  unmappedNetBoxRoles,
  isPhysicalInterface,
  planDevicePorts,
  planNetBoxImport,
  sameImport,
  readNetBoxCabling,
  readNetBoxDevices,
} from "./netboxImport";
import type { ImportedDevice, InventoryDevice } from "./netboxImport";

const MAC_A = "aa:aa:aa:aa:aa:01";
const MAC_B = "aa:aa:aa:aa:aa:02";
const MAC_C = "aa:aa:aa:aa:aa:03";

describe("readNetBoxDevices", () => {
  const roles = [
    { id: 4, name: "Workstation", type: "pc" as const },
    { id: 9, name: "Switch", type: "switch" as const },
  ];

  it("reads the devices of mapped roles with their interfaces' MAC addresses", () => {
    const devices = readNetBoxDevices(
      [
        {
          id: 12,
          name: "pc-0012",
          role: { id: 4 },
          serial: " SN-12 ",
          device_type: { model: "OptiPlex 7010" },
          primary_ip: { address: "10.0.4.12/24" },
          display_url: "https://netbox.test/dcim/devices/12/",
        },
        {
          id: 13,
          name: null,
          role: { id: 9 },
          device_type: { model: "C9300" },
        },
        { id: 14, name: "rack-1", role: { id: 2 } },
      ],
      [
        {
          device: { id: 12 },
          mac_addresses: [{ mac_address: "AA-AA-AA-AA-AA-02" }],
          primary_mac_address: { mac_address: "aa:aa:aa:aa:aa:01" },
        },
        { device: { id: 12 }, mac_addresses: [{ mac_address: "not a mac" }] },
        { device: { id: 13 }, mac_address: "aaaa.aaaa.aa03" },
      ],
      roles,
    );
    expect(devices).toEqual([
      {
        externalId: "12",
        url: "https://netbox.test/dcim/devices/12/",
        type: "pc",
        name: "pc-0012",
        serial: "SN-12",
        macs: [MAC_A, MAC_B],
        model: "OptiPlex 7010",
        ip: "10.0.4.12",
      },
      {
        externalId: "13",
        url: undefined,
        type: "switch",
        name: "C9300 #13",
        serial: undefined,
        macs: [MAC_C],
        model: "C9300",
        ip: undefined,
      },
    ]);
  });

  it("reads a placeholder model or serial as none", () => {
    const [device] = readNetBoxDevices(
      [
        {
          id: 20,
          name: null,
          role: { id: 4 },
          serial: "System Serial Number",
          device_type: { model: "undefined" },
        },
      ],
      [],
      roles,
    );
    expect(device).toMatchObject({
      name: "Équipement #20",
      serial: undefined,
      model: undefined,
    });
  });
});

const netbox = (
  externalId: string,
  more: Partial<ImportedDevice> = {},
): ImportedDevice => ({
  externalId,
  type: "pc",
  name: `nb-${externalId}`,
  macs: [],
  ...more,
});

const manual = (
  id: string,
  more: Partial<InventoryDevice> = {},
): InventoryDevice => ({ id, name: id, macs: [], placed: false, ...more });

describe("importedName", () => {
  it("names an unnamed device after its model and id, as the import does", () => {
    expect(importedName({ id: 9, name: "pc-9" })).toBe("pc-9");
    expect(importedName({ id: 9, device_type: { model: "OptiPlex" } })).toBe(
      "OptiPlex #9",
    );
    expect(
      importedName({ id: 9, name: "", device_type: { model: "undefined" } }),
    ).toBe("Équipement #9");
  });
});

describe("planNetBoxImport", () => {
  it("updates the devices NetBox brought and creates new ones", () => {
    const plan = planNetBoxImport(
      [netbox("1", { macs: [MAC_A] }), netbox("2")],
      [manual("device:one", { netboxId: "1", macs: [MAC_A] })],
    );
    expect(plan.update).toEqual([
      {
        deviceId: "device:one",
        device: netbox("1", { macs: [MAC_A] }),
        bind: false,
      },
    ]);
    expect(plan.create.map((d) => d.externalId)).toEqual(["2"]);
    expect(plan.macs.get("device:one")).toEqual([MAC_A]);
  });

  it("merges into the one manual device sharing a MAC or serial", () => {
    const plan = planNetBoxImport(
      [netbox("1", { macs: [MAC_A] }), netbox("2", { serial: "SN-2" })],
      [
        manual("device:a", { macs: [MAC_A] }),
        manual("device:b", { serial: "sn-2" }),
      ],
    );
    expect(plan.update.map((u) => [u.deviceId, u.bind])).toEqual([
      ["device:a", true],
      ["device:b", true],
    ]);
    expect(plan.create).toEqual([]);
  });

  it("ignores placeholder serials and identifiers the import shares", () => {
    const plan = planNetBoxImport(
      [
        netbox("1", { serial: "System Serial Number" }),
        netbox("2", { macs: [MAC_A, MAC_B] }),
        netbox("3", { macs: [MAC_A] }),
      ],
      [
        manual("device:p", { serial: "system serial number" }),
        manual("device:m", { macs: [MAC_A] }),
      ],
    );
    expect(plan.update).toEqual([]);
    expect(plan.create.map((d) => d.externalId)).toEqual(["1", "2", "3"]);
    // The shared MAC stays with the manual device; the others keep theirs.
    expect(plan.macs.get("netbox:2")).toEqual([MAC_B]);
    expect(plan.macs.get("netbox:3")).toEqual([]);
  });

  it("sends a contradiction or several candidates to an admin", () => {
    const plan = planNetBoxImport(
      [
        netbox("1", { serial: "SN-1", macs: [MAC_A] }),
        netbox("2", { macs: [MAC_B, MAC_C] }),
      ],
      [
        manual("device:a", { serial: "SN-other", macs: [MAC_A] }),
        manual("device:b", { macs: [MAC_B] }),
        manual("device:c", { macs: [MAC_C] }),
      ],
    );
    expect(plan.conflict).toEqual([
      {
        device: netbox("1", { serial: "SN-1", macs: [MAC_A] }),
        candidateIds: ["device:a"],
      },
      {
        device: netbox("2", { macs: [MAC_B, MAC_C] }),
        candidateIds: ["device:b", "device:c"],
      },
    ]);
    expect(plan.update).toEqual([]);
    expect(plan.create).toEqual([]);
  });

  it("asks an Éditeur when only a hostname matches", () => {
    const plan = planNetBoxImport(
      [netbox("1", { name: "PC-0012" }), netbox("2", { name: "pc-0099" })],
      [
        manual("device:a", {
          name: "Poste accueil",
          hostname: "pc-0012.corp.test",
        }),
        manual("device:b", { name: "pc-0099" }),
        manual("device:c", { name: "PC-0099" }),
      ],
    );
    expect(plan.suggest).toEqual([
      { device: netbox("1", { name: "PC-0012" }), candidateIds: ["device:a"] },
    ]);
    expect(plan.conflict.map((c) => c.candidateIds)).toEqual([
      ["device:b", "device:c"],
    ]);
  });

  it("does not merge two NetBox devices into one manual device", () => {
    const plan = planNetBoxImport(
      [netbox("1", { serial: "SN-1" }), netbox("2", { macs: [MAC_A] })],
      [manual("device:a", { serial: "SN-1", macs: [MAC_A] })],
    );
    expect(plan.update).toEqual([]);
    expect(plan.conflict.map((c) => c.device.externalId)).toEqual(["1", "2"]);
  });

  it("marks what NetBox no longer returns as absent, placed or not, and keeps its MACs", () => {
    const plan = planNetBoxImport(
      [netbox("3", { macs: [MAC_C] })],
      [
        manual("device:gone", { netboxId: "1", macs: [MAC_A] }),
        manual("device:placed", { netboxId: "2", placed: true, macs: [MAC_B] }),
        manual("device:already", { netboxId: "4", missingSince: 1 }),
        manual("device:librenms", { netboxId: null }),
      ],
    );
    // An absence already recorded keeps its date.
    expect(plan.missing).toEqual(["device:gone", "device:placed"]);
    expect(plan.update).toEqual([]);
    expect(plan.macs.get("netbox:3")).toEqual([MAC_C]);
  });

  it("links an absent device again when NetBox returns it, under its id or by its identifiers", () => {
    const plan = planNetBoxImport(
      [
        netbox("1"),
        netbox("9", { macs: [MAC_A] }),
        netbox("8", { name: "pc-0008" }),
      ],
      [
        manual("device:back", { netboxId: "1", missingSince: 1 }),
        manual("device:recreated", {
          netboxId: "2",
          missingSince: 1,
          macs: [MAC_A],
        }),
        manual("device:renamed", { netboxId: "3", name: "PC-0008" }),
      ],
    );
    expect(plan.update.map((u) => [u.deviceId, u.device.externalId])).toEqual([
      ["device:back", "1"],
      ["device:recreated", "9"],
    ]);
    // Only a hostname matches: a person decides, as for a manual device.
    expect(plan.suggest.map((entry) => entry.candidateIds)).toEqual([
      ["device:renamed"],
    ]);
    expect(plan.missing).toEqual(["device:renamed"]);
    expect(plan.macs.get("device:recreated")).toEqual([MAC_A]);
  });

  it("never offers a device NetBox still returns to another NetBox device", () => {
    const plan = planNetBoxImport(
      [netbox("1"), netbox("2", { serial: "SN-1", macs: [MAC_A] })],
      [manual("device:one", { netboxId: "1", serial: "SN-1", macs: [MAC_A] })],
    );
    expect(plan.update.map((u) => u.deviceId)).toEqual(["device:one"]);
    expect(plan.create.map((d) => d.externalId)).toEqual(["2"]);
  });
});

describe("absencePurgeDue", () => {
  const DAY = 24 * 60 * 60_000;
  it("counts 30 days from the later of the absence and leaving the plan", () => {
    const at = 100 * DAY;
    const due = (missingFor: number, offPlanFor?: number, placed = false) =>
      absencePurgeDue(
        {
          placed,
          missingSince: at - missingFor,
          offPlanSince: offPlanFor === undefined ? undefined : at - offPlanFor,
        },
        at,
      );
    expect(due(30 * DAY, 30 * DAY)).toBe(true);
    expect(due(40 * DAY, 29 * DAY)).toBe(false);
    // The purge has not yet seen it off the plan.
    expect(due(40 * DAY)).toBe(false);
    expect(due(40 * DAY, 40 * DAY, true)).toBe(false);
  });
});

describe("importSummary", () => {
  it("says what changed", () => {
    expect(
      importSummary({
        imported: 463,
        created: 12,
        merged: 1,
        missing: 3,
        returned: 1,
        review: 2,
        replacedCables: 2,
      }),
    ).toBe(
      "Import : 463 équipements (12 nouveaux, 1 rattaché, 3 absents de NetBox, 1 de retour, 2 à vérifier). 2 câbles saisis à la main remplacés par NetBox.",
    );
    expect(
      importSummary({
        imported: 1,
        created: 0,
        merged: 0,
        missing: 0,
        returned: 0,
        review: 0,
        replacedCables: 1,
      }),
    ).toBe(
      "Import : 1 équipement. 1 câble saisi à la main remplacé par NetBox.",
    );
  });
});

describe("unmappedNetBoxRoles", () => {
  it("counts the devices of each role that has no type, leaving out those without a role", () => {
    expect(
      unmappedNetBoxRoles(
        [
          { id: 1, role: { id: 4, name: "Workstation" } },
          { id: 2, role: { id: 6, name: "Serveur" } },
          { id: 3, role: { id: 6, name: "Serveur" } },
          { id: 4, device_role: { id: 5, name: "Imprimante" } },
          { id: 5, role: null },
        ],
        [{ id: 4, name: "Workstation", type: "pc" }],
      ),
    ).toEqual([
      { id: 5, name: "Imprimante", devices: 1 },
      { id: 6, name: "Serveur", devices: 2 },
    ]);
  });
});

describe("sameImport", () => {
  const settings = (
    site: number,
    ...roles: Array<[number, "pc" | "switch"]>
  ) => ({
    site: { id: site, name: `Site ${site}` },
    roles: roles.map(([id, type]) => ({ id, name: `Role ${id}`, type })),
  });

  it("compares the site and each role's type, in any order", () => {
    const saved = settings(1, [4, "pc"], [9, "switch"]);
    expect(sameImport(saved, settings(1, [9, "switch"], [4, "pc"]))).toBe(true);
    expect(sameImport(saved, settings(2, [4, "pc"], [9, "switch"]))).toBe(
      false,
    );
    expect(sameImport(saved, settings(1, [4, "pc"]))).toBe(false);
    expect(sameImport(saved, settings(1, [4, "pc"], [9, "pc"]))).toBe(false);
  });
});

describe("readNetBoxCabling", () => {
  it("leaves out virtual interfaces, by their type or by a name systems give them", () => {
    const named = (name: string) =>
      isPhysicalInterface({ name, type: { value: "1000base-t" } });
    for (const name of [
      "vmbr0",
      "vmbr0v12",
      "bond0",
      "veth12ab",
      "br-3",
      "Po1",
      "Port-channel10",
      "lo",
      "Gi1/0/1.100",
      "docker0",
    ]) {
      expect(named(name)).toBe(false);
    }
    for (const name of [
      "eno1",
      "enp179s0f0np0",
      "IDRac",
      "GigabitEthernet1/0/1",
      "Ethernet1/49",
      "wlan0",
      "bri0",
      "1",
    ]) {
      expect(named(name)).toBe(true);
    }
  });

  it("leaves out virtual, bridge and aggregate interfaces", () => {
    const { ports } = readNetBoxCabling([netbox("1")], {
      interfaces: [
        {
          id: 1,
          device: { id: 1 },
          name: "eno1",
          type: { value: "1000base-t" },
        },
        { id: 2, device: { id: 1 }, name: "vmbr0", type: { value: "bridge" } },
        {
          id: 3,
          device: { id: 1 },
          name: "vmbr0v12",
          type: { value: "virtual" },
        },
        { id: 4, device: { id: 1 }, name: "Po1", type: { value: "lag" } },
        {
          id: 5,
          device: { id: 1 },
          name: "wlan0",
          type: { value: "ieee802.11ax" },
        },
      ],
      rearPorts: [],
      frontPorts: [],
      cables: [],
    });
    expect(ports.map((port) => port.name)).toEqual(["eno1", "wlan0"]);
  });

  const devices = [netbox("1"), netbox("2")];
  const term = (objectType: string, id: number) => [
    { object_type: objectType, object_id: id },
  ];

  it("reads the imported devices' ports and the cables between them", () => {
    const { ports, cables } = readNetBoxCabling(devices, {
      interfaces: [
        { id: 10, device: { id: 1 }, name: "Gi1/0/1" },
        { id: 11, device: { id: 9 }, name: "eth0" },
      ],
      rearPorts: [{ id: 30, device: { id: 2 }, name: "R1" }],
      frontPorts: [
        // NetBox 4.5 and later list the rear ports a front port maps to.
        {
          id: 20,
          device: { id: 2 },
          name: "F1",
          rear_ports: [{ rear_port: 30 }],
        },
        { id: 21, device: { id: 2 }, name: "F2", rear_port: { id: 31 } },
      ],
      cables: [
        {
          id: 100,
          a_terminations: term("dcim.interface", 10),
          b_terminations: term("dcim.frontport", 20),
        },
        // To a device the import leaves out.
        {
          id: 101,
          a_terminations: term("dcim.interface", 11),
          b_terminations: term("dcim.rearport", 30),
        },
        // A breakout.
        {
          id: 102,
          a_terminations: [
            ...term("dcim.rearport", 30),
            ...term("dcim.frontport", 21),
          ],
          b_terminations: term("dcim.interface", 10),
        },
        // A second cable on a port.
        {
          id: 103,
          a_terminations: term("dcim.interface", 10),
          b_terminations: term("dcim.rearport", 30),
        },
      ],
    });
    expect(ports).toEqual([
      {
        deviceExternalId: "1",
        externalId: "interface:10",
        kind: "interface",
        name: "Gi1/0/1",
        rearExternalId: undefined,
      },
      {
        deviceExternalId: "2",
        externalId: "rear-port:30",
        kind: "rear",
        name: "R1",
        rearExternalId: undefined,
      },
      {
        deviceExternalId: "2",
        externalId: "front-port:20",
        kind: "front",
        name: "F1",
        rearExternalId: "rear-port:30",
      },
      {
        deviceExternalId: "2",
        externalId: "front-port:21",
        kind: "front",
        name: "F2",
        rearExternalId: "rear-port:31",
      },
    ]);
    expect(cables).toEqual([
      { externalId: "100", a: "interface:10", b: "front-port:20" },
    ]);
  });
});

describe("planDevicePorts", () => {
  const wanted = (externalId: string, name: string) => ({
    deviceExternalId: "1",
    externalId,
    kind: "interface" as const,
    name,
  });

  it("keeps the ports NetBox already gave and the manual ports it names alike", () => {
    const plan = planDevicePorts(
      "device:a",
      [
        {
          id: "port:device:a:nb:interface:10",
          name: "old",
          kind: "interface",
          netboxId: "interface:10",
        },
        {
          id: "port:device:a:interface:1",
          name: "GI1/0/2",
          kind: "interface",
          netboxId: null,
        },
        {
          id: "port:device:a:interface:2",
          name: "Port 2",
          kind: "interface",
          netboxId: null,
        },
        {
          id: "port:device:a:front:1",
          name: "Gi1/0/3",
          kind: "front",
          netboxId: null,
        },
      ],
      [
        wanted("interface:10", "Gi1/0/1"),
        wanted("interface:11", "Gi1/0/2"),
        wanted("interface:12", "Gi1/0/3"),
      ],
    );
    expect(plan.ports.map(({ id, order }) => [id, order])).toEqual([
      ["port:device:a:nb:interface:10", 1],
      ["port:device:a:interface:1", 2],
      ["port:device:a:nb:interface:12", 3],
    ]);
    expect(plan.remove).toEqual([
      "port:device:a:interface:2",
      "port:device:a:front:1",
    ]);
  });

  it("never gives a new port the id of a port another NetBox left behind", () => {
    const plan = planDevicePorts(
      "device:a",
      [
        {
          id: "port:device:a:nb:interface:11",
          name: "eth1",
          kind: "interface",
          netboxId: null,
        },
        {
          id: "port:device:a:nb:interface:12",
          name: "old",
          kind: "interface",
          netboxId: null,
        },
      ],
      [
        wanted("interface:11", "eth2"),
        wanted("interface:10", "eth1"),
        wanted("interface:12", "eth3"),
      ],
    );
    expect(plan.ports.map(({ id }) => id)).toEqual([
      "port:device:a:nb:interface:11:2",
      "port:device:a:nb:interface:11",
      "port:device:a:nb:interface:12:2",
    ]);
    expect(plan.remove).toEqual(["port:device:a:nb:interface:12"]);
  });

  it("keeps a port whose NetBox port is gone when the new one is named alike", () => {
    const plan = planDevicePorts(
      "device:a",
      [
        {
          id: "port:device:a:nb:interface:10",
          name: "eth0",
          kind: "interface",
          netboxId: "interface:10",
        },
      ],
      [wanted("interface:90", "eth0")],
    );
    expect(plan.ports.map(({ id }) => id)).toEqual([
      "port:device:a:nb:interface:10",
    ]);
    expect(plan.remove).toEqual([]);
  });
});
