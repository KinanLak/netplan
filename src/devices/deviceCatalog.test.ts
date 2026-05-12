import { describe, expect, it } from "bun:test";
import {
  availableDevicesCatalog,
  getAllAvailableDevices,
} from "./deviceCatalog";

describe("available devices catalog", () => {
  it("flattens every catalog entry while preserving catalog order", () => {
    const expectedDevices = Object.values(availableDevicesCatalog).flat();

    expect(getAllAvailableDevices()).toEqual(expectedDevices);
    expect(getAllAvailableDevices().map((device) => device.id)).toEqual(
      expectedDevices.map((device) => device.id),
    );
  });
});
