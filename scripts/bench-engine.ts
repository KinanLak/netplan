/**
 * Micro-benchmarks for the hot map-engine and interaction paths.
 * Run with: bun run bench:engine
 */
import { bench, group, run, summary } from "mitata";
import { materializeDocument } from "@/map-engine/materializeDocument";
import { toDeviceNodes } from "@/devices/reactFlowDeviceAdapter";
import {
  createWallInteractionState,
  getWallInteractionViewModel,
  moveWallPointer,
} from "@/walls/wallInteraction";
import type {
  WallInteractionAdapter,
  WallInteractionContext,
} from "@/walls/wallInteraction";
import {
  computeMergedWallGroups,
  snapPositionToWallGrid,
} from "@/walls/gridGeometry";
import { eraseStroke, previewEraseAtPointer } from "@/walls/engine";
import { buildWallEraseIndex } from "@/walls/gridGeometry/erase";
import { removeObservedOperationLogEntries } from "@/map-session/pendingOperations";
import type { PendingOperationEntry } from "@/map-session/pendingOperations";
import {
  BENCH_FLOOR_ID,
  buildBenchDocument,
  buildBenchPatchOperations,
  buildBenchRoomWalls,
} from "../test/perf/fixtures";

const serverDocument = buildBenchDocument();

group("materializeDocument (150 devices, 200 walls, 30 links)", () => {
  for (const pendingCount of [1, 10, 50, 100]) {
    const operations = buildBenchPatchOperations(pendingCount);
    bench(`${pendingCount} pending ops`, () => {
      materializeDocument(serverDocument, operations);
    });
  }
});

const wallContext: WallInteractionContext = {
  isEditMode: true,
  activeDrawTool: "wall",
  currentFloorId: BENCH_FLOOR_ID,
  selectedWallColor: "concrete",
  wallEraserSize: 1,
  trackPointerPosition: false,
};

const noopAdapter: WallInteractionAdapter = {
  setActiveDrawTool: () => {},
  addWallLine: () => ({
    changed: false,
    nextWalls: [],
    affectedKeys: [],
    reason: "invalid-line",
  }),
  addWallRoom: () => ({
    changed: false,
    nextWalls: [],
    affectedKeys: [],
    reason: "invalid-room",
  }),
  eraseWallAtPointer: () => ({
    changed: false,
    nextWalls: [],
    affectedKeys: [],
    reason: "no-wall-at-pointer",
  }),
  eraseWallStroke: () => ({
    changed: false,
    nextWalls: [],
    affectedKeys: [],
    reason: "empty-stroke",
  }),
  previewEraseWallAtPointer: () => ({
    changed: false,
    nextWalls: [],
    affectedKeys: [],
    reason: "preview-miss",
  }),
};

group("wall tool pointer move (same snapped cell)", () => {
  const state = createWallInteractionState();
  const pointer = { x: 105.3, y: 104.8 };
  const sample = { pointer, snappedPoint: snapPositionToWallGrid(pointer) };

  summary(() => {
    bench("moveWallPointer", () => {
      moveWallPointer(state, wallContext, noopAdapter, sample, 0);
    });

    bench("moveWallPointer + viewModel", () => {
      const next = moveWallPointer(state, wallContext, noopAdapter, sample, 0);
      getWallInteractionViewModel(next, wallContext);
    });
  });
});

group("wall geometry merge (room floorplans)", () => {
  for (const rooms of [12, 24, 48]) {
    const walls = buildBenchRoomWalls(rooms);
    bench(`computeMergedWallGroups (${rooms} rooms, ${walls.length} walls)`, () => {
      computeMergedWallGroups(walls);
    });
  }
});

group("eraser engine (48 rooms, ~1250 walls)", () => {
  const walls = buildBenchRoomWalls(48);
  const eraseIndex = buildWallEraseIndex(walls, BENCH_FLOOR_ID);

  bench("buildWallEraseIndex (once per document change)", () => {
    buildWallEraseIndex(walls, BENCH_FLOOR_ID);
  });

  bench("previewEraseAtPointer (cached index — app hover path)", () => {
    previewEraseAtPointer({
      walls,
      floorId: BENCH_FLOOR_ID,
      pointer: { x: 130, y: 130 },
      snappedPoint: { x: 130, y: 130 },
      eraserSize: 3,
      eraseIndex,
    });
  });

  bench("eraseStroke (cached index, drag across 12 cells)", () => {
    eraseStroke({
      walls,
      floorId: BENCH_FLOOR_ID,
      fromPointer: { x: 30, y: 110 },
      fromSnappedPoint: { x: 30, y: 110 },
      toPointer: { x: 30 + 12 * 20, y: 110 },
      toSnappedPoint: { x: 30 + 12 * 20, y: 110 },
      eraserSize: 3,
      eraseIndex,
    });
  });
});

group("device node adapter", () => {
  bench("toDeviceNodes (150 devices)", () => {
    toDeviceNodes(serverDocument.devices, BENCH_FLOOR_ID, null, true);
  });
});

group("pending operation reconciliation (nothing to remove)", () => {
  const entries: Array<PendingOperationEntry> = buildBenchPatchOperations(
    20,
  ).map((operation) => ({ operation, floorId: BENCH_FLOOR_ID }));
  const observations = entries.map((entry) => ({
    status: "applied" as const,
    opId: entry.operation.meta.opId,
    floorId: BENCH_FLOOR_ID as string,
    appliedRevision: 2,
  }));

  bench("removeObservedOperationLogEntries (20 kept entries)", () => {
    removeObservedOperationLogEntries(entries, BENCH_FLOOR_ID, observations);
  });
});

const identityProbe = () => {
  const state = createWallInteractionState();
  const pointer = { x: 105.3, y: 104.8 };
  const sample = { pointer, snappedPoint: snapPositionToWallGrid(pointer) };
  const first = moveWallPointer(state, wallContext, noopAdapter, sample, 0);
  const second = moveWallPointer(first, wallContext, noopAdapter, sample, 0);
  const entries: Array<PendingOperationEntry> = buildBenchPatchOperations(
    5,
  ).map((operation) => ({ operation, floorId: BENCH_FLOOR_ID }));
  const kept = removeObservedOperationLogEntries(entries, BENCH_FLOOR_ID, [
    {
      status: "applied",
      opId: entries[0].operation.meta.opId,
      floorId: BENCH_FLOOR_ID as string,
      appliedRevision: 2,
    },
  ]);

  console.log(
    `identity stability — moveWallPointer same-cell reuses state: ${
      second === first
    }, reconciliation keeps array identity: ${kept === entries}`,
  );
};

identityProbe();
await run();
