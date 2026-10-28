import type { MapDocumentSnapshot } from "@/types/map";
import { cableTouches } from "@/devices/ports";
import { applyOperation } from "./applyOperation";
import { applyLabelPatch } from "./labels";
import type { LabelPatch } from "./labels";
import type { BatchSubOperation, DevicePatch, MapOperation } from "./types";

/** Sub-operations of an inverse, flattening a nested batch. */
const batchOperations = (operation: MapOperation): Array<BatchSubOperation> => {
  if (operation.kind === "batch") return operation.operations;
  const { meta: _meta, ...withoutMeta } = operation;
  return [withoutMeta];
};

const withMeta = (
  operation: BatchSubOperation,
  meta: MapOperation["meta"],
): MapOperation => ({ ...operation, meta });

const invertDevicePatch = (
  snapshot: MapDocumentSnapshot,
  operation: Extract<MapOperation, { kind: "device.patch" }>,
): MapOperation | null => {
  const device = snapshot.devices.find(
    (item) => item.id === operation.deviceId,
  );
  if (!device) return null;

  // The inverse expects the device where the operation leaves it: anywhere
  // else, someone has moved it since.
  const patch: DevicePatch = {};
  const expected: DevicePatch = {};
  if (operation.patch.position !== undefined) {
    patch.position = device.position;
    expected.position = operation.patch.position;
  }
  if (operation.patch.size !== undefined) {
    patch.size = device.size;
    expected.size = operation.patch.size;
  }

  return {
    kind: "device.patch",
    meta: operation.meta,
    deviceId: operation.deviceId,
    patch,
    expected,
  };
};

const invertOverlayPatch = (
  snapshot: MapDocumentSnapshot,
  operation: Extract<MapOperation, { kind: "overlay.patch" }>,
): MapOperation | null => {
  const overlay = snapshot.overlay;
  if (!overlay) return null;

  const patch: Extract<MapOperation, { kind: "overlay.patch" }>["patch"] = {};
  if (operation.patch.center !== undefined) patch.center = overlay.center;
  if (operation.patch.scale !== undefined) patch.scale = overlay.scale;
  if (operation.patch.rotation !== undefined) patch.rotation = overlay.rotation;
  if (operation.patch.opacity !== undefined) patch.opacity = overlay.opacity;
  if (operation.patch.locked !== undefined) patch.locked = overlay.locked;

  return {
    kind: "overlay.patch",
    meta: operation.meta,
    floorId: operation.floorId,
    patch,
  };
};

export function buildInverseOperation(
  snapshotBeforeOperation: MapDocumentSnapshot,
  operation: MapOperation,
): MapOperation | null {
  switch (operation.kind) {
    case "device.create":
      return {
        kind: "device.delete",
        meta: operation.meta,
        deviceId: operation.device.id,
      };

    case "device.patch":
      return invertDevicePatch(snapshotBeforeOperation, operation);

    case "devices.move": {
      const ids = new Set(operation.deviceIds);
      const { offset } = operation;
      return {
        kind: "devices.move",
        meta: operation.meta,
        deviceIds: operation.deviceIds,
        offset: { x: -offset.x, y: -offset.y },
        // Each where the move leaves it: anywhere else, someone has moved
        // it since, and the group would come back deformed.
        expected: snapshotBeforeOperation.devices
          .filter((device) => ids.has(device.id))
          .map((device) => ({
            deviceId: device.id,
            position: {
              x: device.position.x + offset.x,
              y: device.position.y + offset.y,
            },
          })),
      };
    }

    case "device.delete": {
      const device = snapshotBeforeOperation.devices.find(
        (item) => item.id === operation.deviceId,
      );
      // A sourced device is never deleted, so there is nothing to restore.
      if (!device || device.source) return null;
      return {
        kind: "device.create",
        meta: operation.meta,
        device,
        ports: snapshotBeforeOperation.ports
          .filter((port) => port.deviceId === device.id)
          .map(({ source: _, ...port }) => port),
        // A source's cable comes back with its next sync, not as a manual one.
        cables: snapshotBeforeOperation.cables.filter(
          (cable) => cableTouches(cable, device.id) && !cable.source,
        ),
      };
    }

    case "device.place":
      return {
        kind: "device.unplace",
        meta: operation.meta,
        deviceId: operation.device.id,
        expected: {
          position: operation.device.position,
          size: operation.device.size,
        },
      };

    case "device.unplace": {
      const device = snapshotBeforeOperation.devices.find(
        (item) => item.id === operation.deviceId,
      );
      // Its ports and cables stayed with it in the inventory.
      return device
        ? { kind: "device.place", meta: operation.meta, device }
        : null;
    }

    case "walls.add":
      return {
        kind: "walls.delete",
        meta: operation.meta,
        wallIds: operation.walls.map((wall) => wall.id),
      };

    case "walls.delete": {
      const wallIds = new Set(operation.wallIds);
      const walls = snapshotBeforeOperation.walls.filter((wall) =>
        wallIds.has(wall.id),
      );
      return walls.length > 0
        ? { kind: "walls.add", meta: operation.meta, walls }
        : null;
    }

    case "overlay.set": {
      const restore: BatchSubOperation = {
        kind: "overlay.set",
        floorId: operation.floorId,
        overlay: snapshotBeforeOperation.overlay,
      };
      // A locked calque refuses to be replaced, so the undo of placing one
      // locked first unlocks it, in the same change.
      return operation.overlay?.locked
        ? {
            kind: "batch",
            meta: operation.meta,
            operations: [
              {
                kind: "overlay.patch",
                floorId: operation.floorId,
                patch: { locked: false },
              },
              restore,
            ],
          }
        : withMeta(restore, operation.meta);
    }

    case "overlay.patch":
      return invertOverlayPatch(snapshotBeforeOperation, operation);

    case "label.create":
      return {
        kind: "label.delete",
        meta: operation.meta,
        labelId: operation.label.id,
      };

    case "label.patch": {
      const label = snapshotBeforeOperation.labels.find(
        (item) => item.id === operation.labelId,
      );
      if (!label) return null;
      const next = applyLabelPatch(label, operation.patch);
      const restore: LabelPatch = {};
      const expected: LabelPatch = {};
      if (operation.patch.text !== undefined) {
        restore.text = label.text;
        expected.text = next.text;
      }
      if (operation.patch.position !== undefined) {
        restore.position = label.position;
        expected.position = next.position;
      }
      return {
        kind: "label.patch",
        meta: operation.meta,
        labelId: label.id,
        patch: restore,
        // Someone else may have moved or renamed it since.
        expected,
      };
    }

    case "label.delete": {
      const label = snapshotBeforeOperation.labels.find(
        (item) => item.id === operation.labelId,
      );
      return label
        ? { kind: "label.create", meta: operation.meta, label }
        : null;
    }

    case "batch": {
      const inverses: Array<MapOperation> = [];
      let currentSnapshot = snapshotBeforeOperation;
      for (const subOperation of operation.operations) {
        const operationWithMeta = withMeta(subOperation, operation.meta);
        const inverse = buildInverseOperation(
          currentSnapshot,
          operationWithMeta,
        );
        if (inverse) inverses.unshift(inverse);
        currentSnapshot = applyOperation(
          currentSnapshot,
          operationWithMeta,
        ).snapshot;
      }
      if (inverses.length === 0) return null;
      return inverses.length === 1
        ? inverses[0]
        : {
            kind: "batch",
            meta: operation.meta,
            operations: inverses.flatMap(batchOperations),
          };
    }
  }
}
