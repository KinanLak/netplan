import type {
  ClientId,
  Device,
  DeviceId,
  DeviceType,
  FloorId,
  LinkDoc,
  LinkId,
  MapDocumentSnapshot,
  OperationId,
  OperationMeta,
  WallId,
  WallSegment,
} from "@/types/map";
import type { MapOperation } from "@/map-engine/types";
import { GRID_SIZE } from "@/lib/grid";

export const BENCH_FLOOR_ID = "floor:bench-1" as FloorId;

const DEVICE_TYPES: Array<DeviceType> = ["rack", "switch", "pc", "wall-port"];

export const buildBenchDevice = (
  index: number,
  floorId = BENCH_FLOOR_ID,
): Device => ({
  id: `device:bench-${index}` as DeviceId,
  floorId,
  type: DEVICE_TYPES[index % DEVICE_TYPES.length],
  name: `Device ${index}`,
  hostname: `host-${index}`,
  position: {
    x: (index % 20) * GRID_SIZE * 6,
    y: Math.floor(index / 20) * GRID_SIZE * 6,
  },
  size: { width: 80, height: 80 },
  metadata: { ip: `10.0.${index % 255}.${(index * 7) % 255}`, status: "up" },
});

export const buildBenchWall = (
  index: number,
  floorId = BENCH_FLOOR_ID,
): WallSegment => {
  const x = 2000 + (index % 50) * GRID_SIZE;
  const y = 2000 + Math.floor(index / 50) * GRID_SIZE * 2;
  return {
    id: `wall:bench-${index}` as WallId,
    floorId,
    start: { x, y },
    end: { x: x + GRID_SIZE, y },
    color: "concrete",
    geometryKey: `${floorId}:${x}:${y}`,
  };
};

export const buildBenchLink = (
  index: number,
  deviceCount: number,
): LinkDoc => ({
  id: `link:bench-${index}` as LinkId,
  floorId: BENCH_FLOOR_ID,
  fromDeviceId: `device:bench-${index % deviceCount}` as DeviceId,
  toDeviceId: `device:bench-${(index + 1) % deviceCount}` as DeviceId,
});

export interface BenchDocumentOptions {
  devices?: number;
  walls?: number;
  links?: number;
  revision?: number;
}

export const buildBenchDocument = ({
  devices = 150,
  walls = 200,
  links = 30,
  revision = 1,
}: BenchDocumentOptions = {}): MapDocumentSnapshot => ({
  floorId: BENCH_FLOOR_ID,
  revision,
  devices: Array.from({ length: devices }, (_, index) =>
    buildBenchDevice(index),
  ),
  walls: Array.from({ length: walls }, (_, index) => buildBenchWall(index)),
  links: Array.from({ length: links }, (_, index) =>
    buildBenchLink(index, devices),
  ),
});

export const buildBenchMeta = (sequence: number): OperationMeta => ({
  opId: `op:bench:${sequence}` as OperationId,
  clientId: "client:bench" as ClientId,
  clientSeq: sequence,
  createdAt: 1_700_000_000_000 + sequence,
});

export const buildBenchPatchOperations = (count: number): Array<MapOperation> =>
  Array.from({ length: count }, (_, index) => ({
    kind: "device.patch" as const,
    meta: buildBenchMeta(index),
    deviceId: `device:bench-${index % 150}` as DeviceId,
    patch: {
      position: { x: index * GRID_SIZE, y: index * GRID_SIZE },
    },
  }));
