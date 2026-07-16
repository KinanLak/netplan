import { describe, expect, it } from "bun:test";
import {
  isNetBoxValueDefined,
  matchesNetBoxInventoryFilters,
  netBoxEquipmentLabel,
  netBoxLifecycleLabel,
  netBoxLocationLabel,
} from "@/integrations/netbox/inventory";

const item = {
  type: "pc" as const,
  name: "ordi-86",
  hostname: "ordi-86",
  model: "Dell OptiPlex",
  role: "workstation",
  ip: "192.0.2.86",
  locationPath: ["1er étage", "Floor"],
};

describe("NetBox inventory helpers", () => {
  it("rejects placeholder values returned by the source", () => {
    expect(isNetBoxValueDefined("undefined")).toBe(false);
    expect(isNetBoxValueDefined("undefined2")).toBe(false);
    expect(isNetBoxValueDefined("OptiPlex 7090")).toBe(true);
  });
  it("formats location paths and lifecycle labels", () => {
    expect(netBoxLocationLabel(item.locationPath)).toBe("1er étage › Floor");
    expect(netBoxLocationLabel([])).toBe("Sans emplacement");
    expect(netBoxLifecycleLabel("inventory")).toBe("En inventaire");
    expect(netBoxEquipmentLabel("undefined", "pc", "undefined2")).toBe(
      "Poste de travail",
    );
  });

  it("matches names, models, IPs and locations", () => {
    for (const query of ["ORDI-86", "optiplex", "192.0.2", "1er étage"]) {
      expect(
        matchesNetBoxInventoryFilters(item, {
          query,
          type: "all",
          location: "all",
          hidePlaced: true,
        }),
      ).toBe(true);
    }
  });

  it("filters by type, location and placement", () => {
    expect(
      matchesNetBoxInventoryFilters(item, {
        query: "",
        type: "wall-port",
        location: "all",
        hidePlaced: false,
      }),
    ).toBe(false);
    expect(
      matchesNetBoxInventoryFilters(
        { ...item, placement: { deviceId: "device:1", floorId: "floor:1" } },
        { query: "", type: "all", location: "all", hidePlaced: true },
      ),
    ).toBe(false);
  });
});
