import { describe, expect, it } from "bun:test";
import { librenmsSettingsError, suggestDevice } from "./librenms";

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
