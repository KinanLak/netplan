import type {
  Cable,
  CableId,
  ClientId,
  Device,
  DeviceId,
  DeviceType,
  FloorId,
  MapDocumentSnapshot,
  OperationId,
  OperationMeta,
  Port,
  WallId,
  WallSegment,
} from "@/types/map";
import type { MapOperation } from "@/map-engine/types";
import { GRID_SIZE } from "@/lib/grid";
import { numberedPorts, portIdOf } from "@/devices/ports";

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
  macs: [],
  ip: `10.0.${index % 255}.${(index * 7) % 255}`,
  metadata: { status: "up" },
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

const benchDeviceId = (index: number) => `device:bench-${index}` as DeviceId;

/** Two interfaces per device, so each can be cabled to both neighbours. */
export const buildBenchPorts = (deviceCount: number): Array<Port> =>
  Array.from({ length: deviceCount }, (_, index) =>
    numberedPorts(benchDeviceId(index), "interface", 2),
  ).flat();

export const buildBenchCable = (index: number, deviceCount: number): Cable => {
  const from = benchDeviceId(index % deviceCount);
  const to = benchDeviceId((index + 1) % deviceCount);
  return {
    id: `cable:bench-${index}` as CableId,
    a: { deviceId: from, portId: portIdOf(from, "interface", 2) },
    b: { deviceId: to, portId: portIdOf(to, "interface", 1) },
  };
};

/**
 * Perimeter wall blocks for room-like floorplans spread across a large map —
 * the realistic worst case for wall-geometry merging (many unique
 * coordinates), unlike the compact block used by `buildBenchWall`.
 */
export const buildBenchRoomWalls = (
  roomCount: number,
  floorId = BENCH_FLOOR_ID,
): Array<WallSegment> => {
  const walls: Array<WallSegment> = [];
  const roomCols = 8;
  const roomRows = 6;
  const spacingCells = 12;
  const roomsPerRow = 10;
  const half = GRID_SIZE / 2;

  for (let room = 0; room < roomCount; room += 1) {
    const originX =
      (room % roomsPerRow) * spacingCells * GRID_SIZE + GRID_SIZE + half;
    const originY =
      Math.floor(room / roomsPerRow) * spacingCells * GRID_SIZE +
      GRID_SIZE +
      half;

    const addBlock = (cellX: number, cellY: number) => {
      const x = originX + cellX * GRID_SIZE;
      const y = originY + cellY * GRID_SIZE;
      walls.push({
        id: `wall:room-${room}-${cellX}-${cellY}` as WallId,
        floorId,
        start: { x, y },
        end: { x, y },
        color: "concrete",
        geometryKey: `${floorId}:${x}:${y}`,
      });
    };

    for (let cellX = 0; cellX < roomCols; cellX += 1) {
      addBlock(cellX, 0);
      addBlock(cellX, roomRows - 1);
    }
    for (let cellY = 1; cellY < roomRows - 1; cellY += 1) {
      addBlock(0, cellY);
      addBlock(roomCols - 1, cellY);
    }
  }

  return walls;
};

export interface BenchDocumentOptions {
  devices?: number;
  walls?: number;
  /** Rooms of spread perimeter walls (≈26 blocks each) instead of `walls`. */
  rooms?: number;
  cables?: number;
  revision?: number;
}

export const buildBenchDocument = ({
  devices = 150,
  walls = 200,
  rooms,
  cables = 30,
  revision = 1,
}: BenchDocumentOptions = {}): MapDocumentSnapshot => ({
  floorId: BENCH_FLOOR_ID,
  revision,
  devices: Array.from({ length: devices }, (_, index) =>
    buildBenchDevice(index),
  ),
  walls:
    rooms !== undefined
      ? buildBenchRoomWalls(rooms)
      : Array.from({ length: walls }, (_, index) => buildBenchWall(index)),
  ports: buildBenchPorts(devices),
  cables: Array.from({ length: cables }, (_, index) =>
    buildBenchCable(index, devices),
  ),
  overlay: null,
  labels: [],
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
