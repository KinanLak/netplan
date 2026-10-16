import { describe, expect, it } from "bun:test";
import {
  importSummary,
  planNetBoxImport,
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

  it("removes unplaced devices NetBox dropped and keeps placed ones as manual", () => {
    const plan = planNetBoxImport(
      [netbox("3", { macs: [MAC_A] })],
      [
        manual("device:gone", { netboxId: "1", macs: [MAC_A] }),
        manual("device:placed", { netboxId: "2", placed: true, macs: [MAC_B] }),
        manual("device:librenms", { netboxId: null }),
      ],
    );
    expect(plan.remove).toEqual(["device:gone"]);
    expect(plan.unbind).toEqual(["device:placed"]);
    // A removed device's MAC goes to the device NetBox now gives it to.
    expect(plan.macs.get("netbox:3")).toEqual([MAC_A]);
  });
});

describe("importSummary", () => {
  it("says what changed", () => {
    expect(
      importSummary({
        imported: 463,
        created: 12,
        merged: 1,
        removed: 0,
        review: 2,
      }),
    ).toBe("Import : 463 équipements (12 nouveaux, 1 rattaché, 2 à vérifier).");
    expect(
      importSummary({
        imported: 1,
        created: 0,
        merged: 0,
        removed: 0,
        review: 0,
      }),
    ).toBe("Import : 1 équipement.");
  });
});
