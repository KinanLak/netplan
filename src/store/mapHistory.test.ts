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
  LinkId,
  LinkSnapshot,
  WallId,
  WallSegment,
} from "@/types/map";
import type { Id } from "../../convex/_generated/dataModel";

const did = (s: string) => s as Id<"devices">;
const fid = (s: string) => s as Id<"floors">;
const lid = (s: string) => s as Id<"links">;
const wid = (s: string) => s as Id<"walls">;

interface FakeBackendOptions {
  initialDevices?: Array<Device>;
  initialLinks?: Array<LinkSnapshot>;
  initialWalls?: Array<WallSegment>;
}

class FakeBackend {
  devices: Array<Device>;
  links: Array<LinkSnapshot>;
  walls: Array<WallSegment>;
  private nextDeviceCounter = 0;
  private nextLinkCounter = 0;
  private nextWallCounter = 0;

  constructor(opts: FakeBackendOptions = {}) {
    this.devices = [...(opts.initialDevices ?? [])];
    this.links = [...(opts.initialLinks ?? [])];
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
        const device = this.devices.find((d) => d._id === id);
        if (!device) throw new Error("Device not found");
        const links = this.links.filter(
          (link) => link.fromDeviceId === id || link.toDeviceId === id,
        );
        this.devices = this.devices.filter((d) => d._id !== id);
        this.links = this.links.filter(
          (link) => link.fromDeviceId !== id && link.toDeviceId !== id,
        );
        return Promise.resolve({
          deviceId: id,
          draft: {
            floorId: device.floorId,
            type: device.type,
            name: device.name,
            hostname: device.hostname,
            position: device.position,
            size: device.size,
            metadata: device.metadata,
          },
          links,
        });
      },
      updatePosition: ({ id, position }) => {
        this.devices = this.devices.map((d) =>
          d._id === id ? { ...d, position } : d,
        );
        return Promise.resolve(null);
      },
      createLink: (snapshot) => {
        this.links.push(snapshot);
        return Promise.resolve(
          lid(`link-fresh-${this.nextLinkCounter++}`) as LinkId,
        );
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

  it("restores links when undoing a device delete with a fresh device id", async () => {
    const original: Device = {
      _id: did("device-linked"),
      _creationTime: 0,
      floorId: FLOOR,
      type: "pc",
      name: "PC",
      position: { x: 0, y: 0 },
      size: { width: 40, height: 40 },
      metadata: {},
    };
    const peer: Device = {
      _id: did("device-peer"),
      _creationTime: 0,
      floorId: FLOOR,
      type: "switch",
      name: "Switch",
      position: { x: 100, y: 0 },
      size: { width: 40, height: 40 },
      metadata: {},
    };
    const backend = new FakeBackend({
      initialDevices: [original, peer],
      initialLinks: [
        {
          floorId: FLOOR,
          fromDeviceId: original._id,
          toDeviceId: peer._id,
          label: "uplink",
        },
      ],
    });

    const removed = await backend.runners().removeDevice({ id: original._id });
    const inverse = buildDeleteDeviceInverse(removed);

    const redoStep = await executeInverseCommand(inverse, backend.runners());
    const recreated = backend.devices.find((d) => d.name === "PC");
    expect(recreated?._id).not.toBe(original._id);
    expect(backend.links).toEqual([
      {
        floorId: FLOOR,
        fromDeviceId: recreated?._id as DeviceId,
        toDeviceId: peer._id,
        label: "uplink",
      },
    ]);
    expect(redoStep.kind).toBe("removeDevice");
  });

  it("executes batch history in reverse and returns a redo batch", async () => {
    const backend = new FakeBackend({
      initialDevices: [
        {
          _id: did("device-a"),
          _creationTime: 0,
          floorId: FLOOR,
          type: "pc",
          name: "PC",
          position: { x: 50, y: 50 },
          size: { width: 40, height: 40 },
          metadata: {},
        },
      ],
    });

    const redoStep = await executeInverseCommand(
      {
        kind: "batch",
        commands: [
          buildMoveDeviceInverse(
            did("device-a"),
            { x: 0, y: 0 },
            { x: 50, y: 50 },
          ),
          buildMoveDeviceInverse(
            did("device-a"),
            { x: 100, y: 100 },
            { x: 0, y: 0 },
          ),
        ],
      },
      backend.runners(),
    );

    expect(backend.devices[0]?.position).toEqual({ x: 0, y: 0 });
    expect(redoStep.kind).toBe("batch");
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
