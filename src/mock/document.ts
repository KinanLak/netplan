import type { MapDocument } from "@/types/map";
import { mockBuildings } from "@/mock/buildings";
import { mockConnections } from "@/mock/connections";
import { mockDevices } from "@/mock/devices";

export const mockMapDocument: MapDocument = {
  buildings: mockBuildings,
  devices: mockDevices,
  walls: [],
  connections: mockConnections,
};

export const createMockMapDocument = (): MapDocument =>
  structuredClone(mockMapDocument);
