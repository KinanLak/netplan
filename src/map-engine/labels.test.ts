import { describe, expect, it } from "bun:test";
import type {
  ClientId,
  FloorId,
  LabelId,
  MapDocumentSnapshot,
  MapLabel,
  OperationId,
} from "@/types/map";
import { applyOperation } from "./applyOperation";
import { buildInverseOperation } from "./buildInverseOperation";
import { labelError, normalizeLabelText } from "./labels";
import type { MapOperation } from "./types";

const floorId = "floor:a" as FloorId;
const meta = {
  opId: "op:labels" as OperationId,
  clientId: "client:labels" as ClientId,
  clientSeq: 1,
  createdAt: 1,
};
const empty: MapDocumentSnapshot = {
  floorId,
  revision: 1,
  devices: [],
  walls: [],
  ports: [],
  cables: [],
  overlay: null,
  labels: [],
};
const hall: MapLabel = {
  id: "label:hall" as LabelId,
  floorId,
  text: "Hall",
  position: { x: 10, y: 20 },
};

/** Applies `operation`, then its inverse, and returns both snapshots. */
const roundTrip = (before: MapDocumentSnapshot, operation: MapOperation) => {
  const after = applyOperation(before, operation);
  const inverse = buildInverseOperation(before, operation);
  if (!inverse) throw new Error("no inverse");
  return { after, undone: applyOperation(after.snapshot, inverse) };
};

describe("label operations", () => {
  it("create, patch and delete, each undone to where it was", () => {
    const created = roundTrip(empty, {
      kind: "label.create",
      meta,
      label: hall,
    });
    expect(created.after.snapshot.labels).toEqual([hall]);
    expect(created.undone.snapshot.labels).toEqual([]);

    const withHall = { ...empty, labels: [hall] };
    const patched = roundTrip(withHall, {
      kind: "label.patch",
      meta,
      labelId: hall.id,
      patch: { text: "Accueil", position: { x: 40, y: 20 } },
    });
    expect(patched.after.snapshot.labels).toEqual([
      { ...hall, text: "Accueil", position: { x: 40, y: 20 } },
    ]);
    expect(patched.undone.snapshot.labels).toEqual([hall]);

    const deleted = roundTrip(withHall, {
      kind: "label.delete",
      meta,
      labelId: hall.id,
    });
    expect(deleted.after.snapshot.labels).toEqual([]);
    expect(deleted.undone.snapshot.labels).toEqual([hall]);
  });

  it("refuses an undo once someone else has changed the label", () => {
    const withHall = { ...empty, labels: [hall] };
    const rename: MapOperation = {
      kind: "label.patch",
      meta,
      labelId: hall.id,
      patch: { text: "Accueil" },
    };
    const inverse = buildInverseOperation(withHall, rename);
    if (!inverse) throw new Error("no inverse");
    // Meanwhile someone else renamed it again.
    const elsewhere = { ...empty, labels: [{ ...hall, text: "Entrée" }] };
    expect(applyOperation(elsewhere, inverse)).toMatchObject({
      applied: false,
      reason: "conflict",
    });
  });

  it("keeps a label's text on one trimmed line, within its length", () => {
    expect(normalizeLabelText("  Salle \n  Rhône ")).toBe("Salle Rhône");
    expect(labelError(hall)).toBe(null);
    expect(labelError({ ...hall, text: "" })).not.toBe(null);
    expect(labelError({ ...hall, text: " Hall" })).not.toBe(null);
    expect(labelError({ ...hall, text: "x".repeat(81) })).not.toBe(null);
  });
});
