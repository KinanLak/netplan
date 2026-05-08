import { describe, expect, it } from "bun:test";
import {
  buildAddDeviceInverse,
  buildAddWallsInverse,
  buildDeleteDeviceInverse,
  buildEraseWallsInverse,
  buildMoveDeviceInverse,
  executeInverseCommand,
} from "@/store/mapHistory";
import type { InverseCommandRunners } from "@/store/mapHistory";
import type {
  Device,
  DeviceDraft,
  DeviceId,
  FloorId,
  WallId,
  WallSegment,
} from "@/types/map";
import type { Id } from "../../convex/_generated/dataModel";

const did = (s: string) => s as Id<"devices">;
const fid = (s: string) => s as Id<"floors">;
const wid = (s: string) => s as Id<"walls">;

interface FakeBackendOptions {
  initialDevices?: Array<Device>;
  initialWalls?: Array<WallSegment>;
}

class FakeBackend {
  devices: Array<Device>;
  walls: Array<WallSegment>;
  private nextDeviceCounter = 0;
  private nextWallCounter = 0;

  constructor(opts: FakeBackendOptions = {}) {
    this.devices = [...(opts.initialDevices ?? [])];
    this.walls = [...(opts.initialWalls ?? [])];
  }

  runners(): InverseCommandRunners {
    return {
      createDevice: (draft) => {
        const id = did(`device-fresh-${this.nextDeviceCounter++}`);
        this.devices.push({
          _id: id,
          _creationTime: 0,
          floorId: draft.floorId,
          type: draft.type,
          name: draft.name,
          hostname: draft.hostname,
          position: draft.position,
          size: draft.size,
          metadata: draft.metadata,
        });
        return Promise.resolve(id);
      },
      removeDevice: ({ id }) => {
        this.devices = this.devices.filter((d) => d._id !== id);
        return Promise.resolve(null);
      },
      updatePosition: ({ id, position }) => {
        this.devices = this.devices.map((d) =>
          d._id === id ? { ...d, position } : d,
        );
        return Promise.resolve(null);
      },
      addStroke: ({ floorId, segments }) => {
        const ids: Array<WallId> = [];
        for (const segment of segments) {
          const id = wid(`wall-fresh-${this.nextWallCounter++}`);
          this.walls.push({
            _id: id,
            _creationTime: 0,
            floorId,
            start: segment.start,
            end: segment.end,
            color: segment.color,
          });
          ids.push(id);
        }
        return Promise.resolve(ids);
      },
      eraseStroke: ({ removeIds }) => {
        const set = new Set<string>(removeIds);
        this.walls = this.walls.filter((w) => !set.has(w._id));
        return Promise.resolve(null);
      },
    };
  }
}

const FLOOR: FloorId = fid("floor-1");

const sampleDraft: DeviceDraft = {
  floorId: FLOOR,
  type: "pc",
  name: "PC-1",
  position: { x: 100, y: 100 },
  size: { width: 40, height: 40 },
  metadata: {},
};

describe("mapHistory inverse commands", () => {
  it("round-trips create → remove → recreate", async () => {
    const backend = new FakeBackend();
    const inverseAfterCreate = buildAddDeviceInverse(
      sampleDraft,
      did("device-original"),
    );

    // Pretend the original create happened with id "device-original"; seed it.
    backend.devices.push({
      _id: did("device-original"),
      _creationTime: 0,
      floorId: FLOOR,
      type: "pc",
      name: "PC-1",
      position: { x: 100, y: 100 },
      size: { width: 40, height: 40 },
      metadata: {},
    });

    // Undo: removes the device.
    const redoStep = await executeInverseCommand(
      inverseAfterCreate,
      backend.runners(),
    );
    expect(backend.devices).toHaveLength(0);
    expect(redoStep.kind).toBe("createDevice");

    // Redo: re-creates the device with a fresh id.
    const undoStepAgain = await executeInverseCommand(
      redoStep,
      backend.runners(),
    );
    expect(backend.devices).toHaveLength(1);
    expect(undoStepAgain.kind).toBe("removeDevice");
    if (undoStepAgain.kind === "removeDevice") {
      expect(undoStepAgain.deviceId).toBe(backend.devices[0]?._id as DeviceId);
    }
  });

  it("round-trips delete → recreate → remove", async () => {
    const original: Device = {
      _id: did("device-x"),
      _creationTime: 0,
      floorId: FLOOR,
      type: "switch",
      name: "Sw-1",
      position: { x: 200, y: 200 },
      size: { width: 60, height: 30 },
      metadata: { ip: "10.0.0.1" },
    };
    const backend = new FakeBackend({ initialDevices: [original] });

    // Delete: capture inverse, then run the actual delete via direct mutation.
    const inverse = buildDeleteDeviceInverse(original);
    await backend.runners().removeDevice({ id: original._id });
    expect(backend.devices).toHaveLength(0);

    // Undo: recreate.
    const redoStep = await executeInverseCommand(inverse, backend.runners());
    expect(backend.devices).toHaveLength(1);
    expect(redoStep.kind).toBe("removeDevice");

    // Redo: remove again.
    const undoStepAgain = await executeInverseCommand(
      redoStep,
      backend.runners(),
    );
    expect(backend.devices).toHaveLength(0);
    expect(undoStepAgain.kind).toBe("createDevice");
  });

  it("round-trips move (A → B → A → B)", async () => {
    const original: Device = {
      _id: did("device-mv"),
      _creationTime: 0,
      floorId: FLOOR,
      type: "pc",
      name: "PC",
      position: { x: 0, y: 0 },
      size: { width: 40, height: 40 },
      metadata: {},
    };
    const backend = new FakeBackend({ initialDevices: [original] });

    // User moves from A → B; backend updated, inverse pushed.
    await backend.runners().updatePosition({
      id: original._id,
      position: { x: 50, y: 50 },
    });
    const inverse = buildMoveDeviceInverse(
      original._id,
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    );

    // Undo → device back at A.
    const redoStep = await executeInverseCommand(inverse, backend.runners());
    expect(backend.devices[0]?.position).toEqual({ x: 0, y: 0 });

    // Redo → device back at B.
    await executeInverseCommand(redoStep, backend.runners());
    expect(backend.devices[0]?.position).toEqual({ x: 50, y: 50 });
  });

  it("round-trips wall stroke add → erase → re-add", async () => {
    const backend = new FakeBackend();
    const segments = [
      {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        color: "concrete" as const,
      },
      {
        start: { x: 10, y: 0 },
        end: { x: 10, y: 10 },
        color: "concrete" as const,
      },
    ];

    const ids = await backend.runners().addStroke({ floorId: FLOOR, segments });
    expect(backend.walls).toHaveLength(2);

    const inverse = buildAddWallsInverse(FLOOR, ids, segments);

    const redoStep = await executeInverseCommand(inverse, backend.runners());
    expect(backend.walls).toHaveLength(0);
    expect(redoStep.kind).toBe("addWalls");

    const undoStepAgain = await executeInverseCommand(
      redoStep,
      backend.runners(),
    );
    expect(backend.walls).toHaveLength(2);
    expect(undoStepAgain.kind).toBe("removeWalls");
  });

  it("round-trips wall stroke erase → re-add → re-erase", async () => {
    const seeded: WallSegment = {
      _id: wid("wall-seed"),
      _creationTime: 0,
      floorId: FLOOR,
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      color: "sand",
    };
    const backend = new FakeBackend({ initialWalls: [seeded] });

    // User erases — capture inverse, then run.
    const inverse = buildEraseWallsInverse(FLOOR, [seeded]);
    await backend.runners().eraseStroke({
      floorId: FLOOR,
      removeIds: [seeded._id],
    });
    expect(backend.walls).toHaveLength(0);

    // Undo → wall recreated with a fresh id.
    const redoStep = await executeInverseCommand(inverse, backend.runners());
    expect(backend.walls).toHaveLength(1);
    expect(redoStep.kind).toBe("removeWalls");
    if (redoStep.kind === "removeWalls") {
      expect(redoStep.ids).toHaveLength(1);
    }

    // Redo → wall erased again.
    await executeInverseCommand(redoStep, backend.runners());
    expect(backend.walls).toHaveLength(0);
  });
});
