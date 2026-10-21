import { describe, expect, it } from "bun:test";
import type {
  FloorId,
  FloorOverlay,
  MapDocumentSnapshot,
  OverlayFileId,
} from "@/types/map";
import { applyOperation } from "./applyOperation";
import { buildInverseOperation } from "./buildInverseOperation";
import { normalizeRotation } from "./overlay";
import type { MapOperation } from "./types";

const floorId = "floor:a" as FloorId;

const meta = (seq: number): MapOperation["meta"] => ({
  opId: `op:overlay:${seq}` as MapOperation["meta"]["opId"],
  clientId: "client:test" as MapOperation["meta"]["clientId"],
  clientSeq: seq,
  createdAt: seq,
});

const overlay = (patch: Partial<FloorOverlay> = {}): FloorOverlay => ({
  floorId,
  fileId: "overlay-file:a" as OverlayFileId,
  imageWidth: 2000,
  imageHeight: 1000,
  center: { x: 400, y: 300 },
  scale: 0.5,
  rotation: 0,
  opacity: 0.6,
  locked: false,
  ...patch,
});

const snapshot = (current: FloorOverlay | null): MapDocumentSnapshot => ({
  floorId,
  revision: 0,
  devices: [],
  walls: [],
  ports: [],
  cables: [],
  overlay: current,
  labels: [],
});

const set = (next: FloorOverlay | null, seq = 1): MapOperation => ({
  kind: "overlay.set",
  meta: meta(seq),
  floorId,
  overlay: next,
});

const patch = (
  value: Extract<MapOperation, { kind: "overlay.patch" }>["patch"],
  seq = 1,
): MapOperation => ({
  kind: "overlay.patch",
  meta: meta(seq),
  floorId,
  patch: value,
});

/** Applies, inverts, and checks the inverse brings back the first snapshot. */
const roundTrip = (before: MapDocumentSnapshot, operation: MapOperation) => {
  const applied = applyOperation(before, operation);
  expect(applied.applied).toBe(true);
  const inverse = buildInverseOperation(before, operation);
  expect(inverse).not.toBeNull();
  const undone = applyOperation(applied.snapshot, inverse as MapOperation);
  expect(undone.applied).toBe(true);
  expect(undone.snapshot.overlay).toEqual(before.overlay);
  return applied.snapshot;
};

describe("overlay operations", () => {
  it("places, replaces and removes a calque, each undoable", () => {
    const placed = roundTrip(snapshot(null), set(overlay()));
    expect(placed.overlay).toEqual(overlay());

    const replacement = overlay({
      fileId: "overlay-file:b" as OverlayFileId,
      imageWidth: 800,
      imageHeight: 600,
    });
    expect(roundTrip(placed, set(replacement)).overlay).toEqual(replacement);
    expect(roundTrip(placed, set(null)).overlay).toBeNull();
  });

  it("patches only the given fields and undoes only those", () => {
    const before = snapshot(overlay());
    const after = roundTrip(
      before,
      patch({ center: { x: 0, y: 0 }, scale: 2, rotation: 90 }),
    );
    expect(after.overlay).toEqual(
      overlay({ center: { x: 0, y: 0 }, scale: 2, rotation: 90 }),
    );
    expect(buildInverseOperation(before, patch({ opacity: 0.3 }))).toEqual({
      kind: "overlay.patch",
      meta: meta(1),
      floorId,
      patch: { opacity: 0.6 },
    });
  });

  it("refuses to move, replace or remove a locked calque", () => {
    const locked = snapshot(overlay({ locked: true }));
    expect(applyOperation(locked, patch({ center: { x: 1, y: 1 } }))).toEqual({
      applied: false,
      snapshot: locked,
      reason: "overlay-locked",
    });
    expect(applyOperation(locked, patch({ scale: 1 })).reason).toBe(
      "overlay-locked",
    );
    expect(applyOperation(locked, set(null)).reason).toBe("overlay-locked");
    expect(
      applyOperation(locked, set(overlay({ locked: true, scale: 1 }))).reason,
    ).toBe("overlay-locked");
  });

  it("still fades a locked calque, and moves it in the change that unlocks it", () => {
    const locked = snapshot(overlay({ locked: true }));
    expect(roundTrip(locked, patch({ opacity: 0.2 })).overlay?.opacity).toBe(
      0.2,
    );
    const unlocked = roundTrip(
      locked,
      patch({ locked: false, center: { x: 10, y: 10 } }),
    );
    expect(unlocked.overlay).toEqual(
      overlay({ locked: false, center: { x: 10, y: 10 } }),
    );
  });

  it("undoes placing or replacing a calque that ends up locked", () => {
    expect(
      roundTrip(snapshot(null), set(overlay({ locked: true }))).overlay?.locked,
    ).toBe(true);

    const replacement = overlay({
      fileId: "overlay-file:b" as OverlayFileId,
      locked: true,
    });
    const replaced = roundTrip(snapshot(overlay({ locked: true })), {
      kind: "batch",
      meta: meta(1),
      operations: [
        { kind: "overlay.patch", floorId, patch: { locked: false } },
        { kind: "overlay.set", floorId, overlay: replacement },
      ],
    });
    expect(replaced.overlay).toEqual(replacement);
  });

  it("locking then undoing restores an unlocked calque", () => {
    const after = roundTrip(snapshot(overlay()), patch({ locked: true }));
    expect(after.overlay?.locked).toBe(true);
  });

  it("refuses invalid placements", () => {
    const current = snapshot(overlay());
    for (const value of [
      { scale: 0 },
      { scale: Number.NaN },
      { rotation: 360 },
      { rotation: -1 },
      { opacity: 0 },
      { opacity: 1.5 },
      { center: { x: Number.POSITIVE_INFINITY, y: 0 } },
    ]) {
      expect(applyOperation(current, patch(value)).reason).toBe(
        "invalid-overlay",
      );
    }
    expect(
      applyOperation(snapshot(null), set(overlay({ imageWidth: 0 }))).reason,
    ).toBe("invalid-overlay");
    expect(
      applyOperation(
        snapshot(null),
        set(overlay({ floorId: "floor:b" as FloorId })),
      ).reason,
    ).toBe("invalid-overlay");
  });

  it("reports a missing calque and a calque of another floor", () => {
    expect(applyOperation(snapshot(null), patch({ opacity: 1 })).reason).toBe(
      "missing-overlay",
    );
    expect(applyOperation(snapshot(null), set(null)).reason).toBe(
      "missing-overlay",
    );
    expect(
      applyOperation(snapshot(overlay()), {
        kind: "overlay.patch",
        meta: meta(1),
        floorId: "floor:b" as FloorId,
        patch: { opacity: 1 },
      }).reason,
    ).toBe("wrong-floor");
    expect(buildInverseOperation(snapshot(null), patch({ opacity: 1 }))).toBe(
      null,
    );
  });

  it("treats placing the same calque again as a no-op inside a batch", () => {
    const current = snapshot(overlay());
    const result = applyOperation(current, {
      kind: "batch",
      meta: meta(1),
      operations: [
        { kind: "overlay.set", floorId, overlay: overlay() },
        { kind: "overlay.patch", floorId, patch: { opacity: 0.9 } },
      ],
    });
    expect(result.applied).toBe(true);
    expect(result.snapshot.overlay?.opacity).toBe(0.9);
  });
});

describe("normalizeRotation", () => {
  it("brings any angle into [0, 360)", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(725)).toBe(5);
  });
});
