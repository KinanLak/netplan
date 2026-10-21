import { describe, expect, it } from "bun:test";
import {
  matchesDeviceName,
  matchesDeviceSearch,
  rankDeviceMatches,
} from "./search";

const device = {
  name: "Poste 3",
  hostname: "pc-demo-poste-3",
  ip: "198.51.100.15",
  macs: ["02:6e:70:00:01:05"],
};

describe("searching devices", () => {
  it("matches the name, hostname or address, whatever the case", () => {
    expect(matchesDeviceSearch(device, "poste 3")).toBe(true);
    expect(matchesDeviceSearch(device, "PC-DEMO")).toBe(true);
    expect(matchesDeviceSearch(device, "100.15")).toBe(true);
    expect(matchesDeviceSearch(device, "imprimante")).toBe(false);
  });

  it("matches a MAC written in any notation", () => {
    expect(matchesDeviceSearch(device, "026E.7000.0105")).toBe(true);
    expect(matchesDeviceSearch(device, "00-01-05")).toBe(true);
  });
});

describe("finding a device on the map", () => {
  const devices = [
    { name: "Poste 12", hostname: "pc-demo-poste-12" },
    { name: "Imprimante", hostname: "poste-print" },
    { name: "Poste 3", hostname: "pc-demo-poste-3" },
  ];

  it("matches the name or hostname only", () => {
    expect(matchesDeviceName(devices[1], "print")).toBe(true);
    expect(matchesDeviceName(devices[0], "")).toBe(false);
    expect(matchesDeviceName({ name: "A", hostname: undefined }, "a")).toBe(
      true,
    );
  });

  it("ranks names that start with the query first, then by name", () => {
    expect(
      rankDeviceMatches(devices, "poste", matchesDeviceName).map((d) => d.name),
    ).toEqual(["Poste 3", "Poste 12", "Imprimante"]);
  });
});

describe("searching what a list shows", () => {
  it("matches the type and place it is given, accents or not", () => {
    const also = ["Poste de travail", "Bâtiment A · Étage 1"];
    expect(matchesDeviceSearch(device, "etage 1", also)).toBe(true);
    expect(matchesDeviceSearch(device, "poste de travail", also)).toBe(true);
    expect(matchesDeviceSearch(device, "étage 4", also)).toBe(false);
  });

  it("wants every word, in any order", () => {
    const also = ["Poste de travail", "Bâtiment A · Étage 1"];
    expect(matchesDeviceSearch(device, "etage 1 poste 3", also)).toBe(true);
    expect(matchesDeviceSearch(device, "poste 3 0105", also)).toBe(true);
    expect(matchesDeviceSearch(device, "poste imprimante", also)).toBe(false);
  });
});
