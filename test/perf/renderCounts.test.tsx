import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { writeFileSync } from "node:fs";
import { act, cleanup, render } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { getFunctionName } from "convex/server";
import { api } from "../../convex/_generated/api";
import { applyOperation } from "@/map-engine/applyOperation";
import type { MapOperation } from "@/map-engine/types";
import type { DeviceId } from "@/types/map";
import { GRID_SIZE } from "@/lib/grid";
import { useMapStore } from "@/store/useMapStore";
import type { SubtreeStats } from "./probes";
import {
  FakeConvexBackend,
  createConvexReactModuleMock,
} from "./convexReactMock";
import { BENCH_FLOOR_ID, buildBenchDocument } from "./fixtures";

const backend = new FakeConvexBackend();
mock.module("convex/react", () => createConvexReactModuleMock(backend));

const { BenchTree, RenderStats, createBenchHandles } = await import("./probes");

const DOC_QUERY = getFunctionName(api.mapDocument.getFloorDocument);
const OBSERVE_QUERY = getFunctionName(api.mapOperations.observePending);

const collected: Record<string, Record<string, SubtreeStats>> = {};

const flushMicrotasks = async (rounds = 4) => {
  for (let round = 0; round < rounds; round += 1) {
    await Promise.resolve();
  }
};

const seedStore = (
  overrides: Partial<Parameters<typeof useMapStore.setState>[0]> = {},
) => {
  useMapStore.setState({
    currentBuildingId: null,
    currentFloorId: BENCH_FLOOR_ID,
    selectedDeviceId: null,
    hoveredDeviceId: null,
    isEditMode: true,
    highlightedDeviceIds: [],
    activeDrawTool: "device",
    selectedWallColor: "concrete",
    ...overrides,
  });
};

const mountTree = async () => {
  const stats = new RenderStats();
  const handles = createBenchHandles();
  const view = render(<BenchTree stats={stats} handles={handles} />);
  await act(async () => {
    await flushMicrotasks(8);
  });
  stats.reset();
  return { stats, handles, view };
};

const fakeMouseEvent = (x: number, y: number, buttons = 0) =>
  ({ clientX: x, clientY: y, buttons }) as unknown as ReactMouseEvent;

const commitsOf = (
  snapshot: Record<string, SubtreeStats>,
  id: string,
): number => (id in snapshot ? snapshot[id].commits : 0);

afterEach(() => {
  cleanup();
  backend.setQueryResult(OBSERVE_QUERY, undefined);
  backend.mutationCalls.length = 0;
});

afterAll(() => {
  const payload = JSON.stringify(collected, null, 2);
  console.log(`PERF_RENDER_STATS ${payload}`);
  if (process.env.PERF_STATS_PATH) {
    writeFileSync(process.env.PERF_STATS_PATH, payload);
  }
});

describe("render counts under realistic interaction bursts", () => {
  it("S1: wall tool pane hover (300 moves in one cell, then 60 crossing cells)", async () => {
    seedStore({ activeDrawTool: "wall" });
    backend.setQueryResult(DOC_QUERY, buildBenchDocument());
    const { stats, handles, view } = await mountTree();

    for (let i = 0; i < 300; i += 1) {
      act(() => {
        handles.bridge?.onPaneMouseMove(
          fakeMouseEvent(105 + (i % 7) * 0.5, 105 + ((i * 3) % 5) * 0.5),
        );
      });
    }
    const sameCell = stats.snapshot();
    collected["S1a-hover-300-moves-same-cell"] = sameCell;
    stats.reset();

    for (let i = 0; i < 60; i += 1) {
      act(() => {
        handles.bridge?.onPaneMouseMove(
          fakeMouseEvent(105 + i * GRID_SIZE, 105),
        );
      });
    }
    const crossingCells = stats.snapshot();
    collected["S1b-hover-60-moves-crossing-cells"] = crossingCells;

    expect(handles.bridge).not.toBeNull();
    // Hovering inside one cell must not re-render the canvas per mouse move.
    expect(commitsOf(sameCell, "canvas-shell")).toBeLessThanOrEqual(2);
    expect(commitsOf(sameCell, "wall-layer")).toBeLessThanOrEqual(5);
    // Crossing cells must still update the hover preview.
    expect(commitsOf(crossingCells, "wall-layer")).toBeGreaterThanOrEqual(55);
    expect(commitsOf(crossingCells, "canvas-shell")).toBeLessThanOrEqual(2);
    view.unmount();
  });

  it("S2: 50 sequential device moves dispatched and acked", async () => {
    seedStore();
    let serverDoc = buildBenchDocument();
    backend.setQueryResult(DOC_QUERY, serverDoc);
    backend.mutationImpl = (_name, args) => {
      const operation = args.operation as MapOperation;
      const applied = applyOperation(serverDoc, operation);
      serverDoc = { ...applied.snapshot, revision: serverDoc.revision + 1 };
      backend.setQueryResult(DOC_QUERY, serverDoc);
      return Promise.resolve({
        status: "applied",
        opId: operation.meta.opId,
        appliedRevision: serverDoc.revision,
        floorId: BENCH_FLOOR_ID,
      });
    };
    const { stats, handles, view } = await mountTree();

    for (let i = 0; i < 50; i += 1) {
      await act(async () => {
        handles.commands?.updateDevicePosition(
          `device:bench-${i}` as DeviceId,
          { x: 6000 + i * GRID_SIZE, y: 6000 },
        );
        await flushMicrotasks(8);
      });
    }
    const snapshot = stats.snapshot();
    collected["S2-dispatch-ack-50-ops"] = snapshot;

    expect(backend.mutationCalls.length).toBe(50);
    // Action/ready-only consumers must not re-render while ops are dispatched
    // and acked; history consumers only re-render once per recorded edit.
    expect(commitsOf(snapshot, "toolbar")).toBeLessThanOrEqual(2);
    expect(commitsOf(snapshot, "workspace")).toBeLessThanOrEqual(2);
    expect(commitsOf(snapshot, "sidebar-history")).toBeLessThanOrEqual(60);
    expect(commitsOf(snapshot, "root")).toBeLessThanOrEqual(220);
    view.unmount();
  });

  it("S3: 20 remote document updates pushed by the server", async () => {
    seedStore();
    let serverDoc = buildBenchDocument();
    backend.setQueryResult(DOC_QUERY, serverDoc);
    const { stats, view } = await mountTree();

    for (let i = 0; i < 20; i += 1) {
      serverDoc = {
        ...serverDoc,
        revision: serverDoc.revision + 1,
        devices: serverDoc.devices.map((device, index) =>
          index === 0
            ? {
                ...device,
                position: {
                  x: device.position.x + GRID_SIZE,
                  y: device.position.y,
                },
              }
            : device,
        ),
      };
      await act(async () => {
        backend.setQueryResult(DOC_QUERY, serverDoc);
        await flushMicrotasks(4);
      });
    }
    const snapshot = stats.snapshot();
    collected["S3-remote-doc-20-updates"] = snapshot;

    // Remote updates only concern document-data consumers.
    expect(commitsOf(snapshot, "canvas-shell")).toBeGreaterThanOrEqual(20);
    expect(commitsOf(snapshot, "toolbar")).toBeLessThanOrEqual(2);
    expect(commitsOf(snapshot, "sidebar-history")).toBeLessThanOrEqual(2);
    expect(commitsOf(snapshot, "workspace")).toBeLessThanOrEqual(2);
    expect(commitsOf(snapshot, "status")).toBeLessThanOrEqual(2);
    view.unmount();
  });

  it("S4: 200 hover on/off toggles on devices", async () => {
    seedStore();
    backend.setQueryResult(DOC_QUERY, buildBenchDocument());
    const { stats, view } = await mountTree();

    for (let i = 0; i < 200; i += 1) {
      act(() => {
        useMapStore
          .getState()
          .setHoveredDevice(
            i % 2 === 0 ? (`device:bench-${i % 10}` as DeviceId) : null,
          );
      });
    }
    const snapshot = stats.snapshot();
    collected["S4-hover-200-toggles"] = snapshot;

    // Hover is consumed per-node; no workspace-level subtree may re-render.
    expect(commitsOf(snapshot, "root")).toBeLessThanOrEqual(2);
    view.unmount();
  });

  it("S5: applied op observed while the doc subscription lags behind", async () => {
    seedStore();
    const serverDoc = buildBenchDocument();
    backend.setQueryResult(DOC_QUERY, serverDoc);
    backend.mutationImpl = (_name, args) => {
      const operation = args.operation as MapOperation;
      return Promise.resolve({
        status: "applied",
        opId: operation.meta.opId,
        appliedRevision: serverDoc.revision + 1,
        floorId: BENCH_FLOOR_ID,
      });
    };
    const { stats, handles, view } = await mountTree();

    await act(async () => {
      handles.commands?.updateDevicePosition("device:bench-0" as DeviceId, {
        x: 7000,
        y: 7000,
      });
      await flushMicrotasks(8);
    });
    const opId = (
      backend.mutationCalls.at(-1)?.args.operation as MapOperation | undefined
    )?.meta.opId;
    expect(opId).toBeDefined();

    // The reconcile loop starves `act`, so measure a bounded real-time
    // window outside of the act environment instead.
    const globalWithActFlag = globalThis as {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = false;
    stats.reset();
    backend.setQueryResult(OBSERVE_QUERY, [
      {
        status: "applied",
        opId,
        floorId: BENCH_FLOOR_ID,
        appliedRevision: serverDoc.revision + 1,
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const snapshot = stats.snapshot();
    collected["S5-lagging-doc-100ms-window"] = snapshot;

    // A lagging doc subscription must not spin a reconcile render loop.
    expect(commitsOf(snapshot, "root")).toBeLessThanOrEqual(5);

    // Let the doc subscription catch up so the loop can settle.
    backend.setQueryResult(DOC_QUERY, {
      ...serverDoc,
      revision: serverDoc.revision + 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => {
      await flushMicrotasks(4);
    });
    view.unmount();
  }, 20_000);

  it("S6: 60-point brush stroke without releasing the mouse", async () => {
    seedStore({ activeDrawTool: "wall-brush" });
    let serverDoc = buildBenchDocument({ rooms: 24 });
    backend.setQueryResult(DOC_QUERY, serverDoc);
    backend.mutationImpl = (_name, args) => {
      const operation = args.operation as MapOperation;
      const applied = applyOperation(serverDoc, operation);
      serverDoc = { ...applied.snapshot, revision: serverDoc.revision + 1 };
      backend.setQueryResult(DOC_QUERY, serverDoc);
      return Promise.resolve({
        status: "applied",
        opId: operation.meta.opId,
        appliedRevision: serverDoc.revision,
        floorId: BENCH_FLOOR_ID,
      });
    };
    const { stats, handles, view } = await mountTree();

    // Stroke start far away from the seeded walls, one new cell per move.
    const strokeAt = (index: number) =>
      fakeMouseEvent(10_005 + index * GRID_SIZE, 10_005, 1);

    for (let i = 0; i < 30; i += 1) {
      act(() => {
        handles.bridge?.onPaneMouseMove(strokeAt(i));
      });
    }
    const firstHalf = stats.snapshot();
    collected["S6a-brush-stroke-points-1-30"] = firstHalf;
    stats.reset();

    for (let i = 30; i < 60; i += 1) {
      act(() => {
        handles.bridge?.onPaneMouseMove(strokeAt(i));
      });
    }
    const secondHalf = stats.snapshot();
    collected["S6b-brush-stroke-points-31-60"] = secondHalf;
    stats.reset();

    // The whole stroke must stay coalesced into ONE pending operation, so
    // materialization stays O(points) instead of O(points²).
    expect(handles.pendingOperationCount).toBe(1);
    expect(commitsOf(secondHalf, "canvas-shell")).toBeLessThanOrEqual(32);
    expect(commitsOf(secondHalf, "wall-layer")).toBeLessThanOrEqual(32);

    await act(async () => {
      window.dispatchEvent(new Event("mouseup"));
      await flushMicrotasks(8);
    });
    collected["S6c-brush-stroke-release"] = stats.snapshot();

    expect(backend.mutationCalls.length).toBeGreaterThanOrEqual(1);
    view.unmount();
  }, 60_000);

  it("S7: hovering a wall preview over a floor with 48 rooms (~1250 walls)", async () => {
    seedStore({ activeDrawTool: "wall" });
    backend.setQueryResult(DOC_QUERY, buildBenchDocument({ rooms: 48 }));
    const { stats, handles, view } = await mountTree();

    // Anchor a wall start so every subsequent move renders a live preview.
    act(() => {
      handles.bridge?.onPaneClick(fakeMouseEvent(10_005, 10_005));
    });
    stats.reset();

    for (let i = 1; i <= 10; i += 1) {
      act(() => {
        handles.bridge?.onPaneMouseMove(
          fakeMouseEvent(10_005 + i * GRID_SIZE, 10_005),
        );
      });
    }
    const snapshot = stats.snapshot();
    collected["S7-wall-preview-10-moves-48-rooms"] = snapshot;

    expect(commitsOf(snapshot, "wall-layer")).toBeGreaterThanOrEqual(10);
    // The canvas shell (and therefore the device nodes) must stay untouched
    // while a wall preview follows the pointer.
    expect(commitsOf(snapshot, "canvas-shell")).toBe(0);
    view.unmount();
  }, 60_000);
});
