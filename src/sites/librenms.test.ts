import { describe, expect, it } from "bun:test";
import {
  librenmsId,
  librenmsSettingsError,
  polledSwitches,
  suggestDevice,
} from "./librenms";

const devices = [
  { id: 1, name: "SW-ACCUEIL.corp.test" },
  { id: 2, name: "sw-etage-1" },
  { id: 3, name: "10.0.0.3" },
  { id: 4, name: "core" },
  { id: 5, name: "core.lab.test" },
];

describe("suggestDevice", () => {
  it("finds the one device named like the switch, domains and case ignored", () => {
    expect(suggestDevice({ name: "sw-accueil" }, devices)?.id).toBe(1);
    expect(
      suggestDevice(
        { name: "Switch étage", hostname: "SW-ETAGE-1.corp" },
        devices,
      )?.id,
    ).toBe(2);
  });

  it("keeps an IP address whole", () => {
    expect(suggestDevice({ name: "10.0.0.3" }, devices)?.id).toBe(3);
    expect(suggestDevice({ name: "10.0.0.30" }, devices)).toBeNull();
  });

  it("suggests nothing when several devices or none match", () => {
    expect(suggestDevice({ name: "core" }, devices)).toBeNull();
    expect(suggestDevice({ name: "sw-cave" }, devices)).toBeNull();
  });
});

describe("librenmsSettingsError", () => {
  it("lets several switches share a device but not a switch two devices", () => {
    const device = { id: 4, name: "core" };
    expect(
      librenmsSettingsError({
        switches: [
          { switchId: "device:a", device },
          { switchId: "device:b", device },
        ],
      }),
    ).toBeNull();
    expect(
      librenmsSettingsError({
        switches: [
          { switchId: "device:a", device },
          { switchId: "device:a", device: { id: 5, name: "core" } },
        ],
      }),
    ).toContain("qu'à un équipement");
    expect(
      librenmsSettingsError({
        switches: [{ switchId: "device:a", device: { id: 0, name: "" } }],
      }),
    ).toContain("n'existe pas");
  });
});

describe("librenmsId", () => {
  it("reads ids LibreNMS returns as numbers or numeric strings", () => {
    expect(librenmsId(12)).toBe(12);
    expect(librenmsId("21")).toBe(21);
    for (const bad of ["abc", "", "1.5", "-3", 0, 1.5, null, undefined]) {
      expect(librenmsId(bad)).toBeNull();
    }
  });
});

describe("polledSwitches", () => {
  it("leaves out the switches chosen not to be polled", () => {
    const device = { id: 4, name: "core" };
    expect(
      polledSwitches({
        switches: [
          { switchId: "device:a", device },
          { switchId: "device:b", device: null },
        ],
      }),
    ).toEqual([{ switchId: "device:a", device }]);
  });
});
