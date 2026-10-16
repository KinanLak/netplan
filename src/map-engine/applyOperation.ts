import type { Cable, Device, MapDocumentSnapshot } from "@/types/map";
import { cableTouches, defaultPorts, portListError } from "@/devices/ports";
import {
  applyOverlayPatch,
  isPatchBlockedByLock,
  overlayError,
  sameOverlay,
} from "./overlay";
import type {
  ApplyOperationReason,
  ApplyOperationResult,
  BatchSubOperation,
  MapOperation,
} from "./types";

const unchanged = (
  snapshot: MapDocumentSnapshot,
  reason: ApplyOperationReason,
): ApplyOperationResult => ({ snapshot, applied: false, reason });

const changed = (snapshot: MapDocumentSnapshot): ApplyOperationResult => ({
  snapshot,
  applied: true,
});

const sameJson = (left: object, right: object): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const placementOf = ({ floorId, position, size }: Device) => ({
  floorId,
  position,
  size,
});

/**
 * The floor without a device and its ports. A deleted device's cables go with
 * it; an unplaced one keeps them, so they stay in view only while their other
 * end is on the floor.
 */
const withoutDevice = (
  snapshot: MapDocumentSnapshot,
  device: Device,
  cables: "delete" | "keep",
): MapDocumentSnapshot => {
  const devices = snapshot.devices.filter((item) => item !== device);
  const onFloor = new Set(devices.map((item) => item.id));
  return {
    ...snapshot,
    devices,
    ports: snapshot.ports.filter((port) => port.deviceId !== device.id),
    cables: snapshot.cables.filter((cable) =>
      cables === "delete"
        ? !cableTouches(cable, device.id)
        : onFloor.has(cable.a.deviceId) || onFloor.has(cable.b.deviceId),
    ),
  };
};

const applyBatch = (
  snapshot: MapDocumentSnapshot,
  parent: MapOperation["meta"],
  operations: ReadonlyArray<MapOperation>,
): ApplyOperationResult => {
  let next = snapshot;
  let applied = false;

  for (const operation of operations) {
    if (operation.kind === "batch") {
      return unchanged(snapshot, "invalid-batch");
    }
    const result = applyOperation(next, { ...operation, meta: parent });
    if (result.reason && !isSafeBatchNoop(operation, result.reason)) {
      return {
        snapshot,
        applied: false,
        reason: result.reason,
      };
    }
    next = result.snapshot;
    applied = applied || result.applied;
  }

  return { snapshot: next, applied };
};

const withParentMeta = (
  operation: BatchSubOperation,
  meta: MapOperation["meta"],
): MapOperation => ({ ...operation, meta });

const isSafeBatchNoop = (
  operation: MapOperation,
  reason: ApplyOperationReason,
): boolean => {
  switch (operation.kind) {
    case "device.create":
      return reason === "already-exists";
    case "device.place":
      return reason === "already-exists";
    case "device.delete":
    case "device.unplace":
      return reason === "missing-device";
    case "walls.add":
      return reason === "duplicate-wall-geometry";
    case "walls.delete":
      return reason === "missing-wall";
    case "overlay.set":
      return reason === "already-exists";
    case "overlay.patch":
    case "device.patch":
    case "batch":
      return false;
  }
};

export function applyOperation(
  snapshot: MapDocumentSnapshot,
  operation: MapOperation,
): ApplyOperationResult {
  switch (operation.kind) {
    case "device.create": {
      const existing = snapshot.devices.find(
        (device) => device.id === operation.device.id,
      );
      if (existing) {
        return sameJson(existing, operation.device)
          ? unchanged(snapshot, "already-exists")
          : unchanged(snapshot, "conflict");
      }
      const { device } = operation;
      const ports = operation.ports ?? defaultPorts(device.id, device.type);
      const cables = operation.cables ?? [];
      // The far end of a cable may be on another floor, which only the
      // server knows; here each cable must at least plug into this device.
      const portIds = new Set<string>(ports.map((port) => port.id));
      const plugsIn = (cable: Cable) =>
        [cable.a, cable.b].some(
          (end) => end.deviceId === device.id && portIds.has(end.portId),
        );
      if (portListError(device.id, ports) || !cables.every(plugsIn)) {
        return unchanged(snapshot, "invalid-ports");
      }
      const known = new Set(snapshot.cables.map((cable) => cable.id));
      return changed({
        ...snapshot,
        devices: [...snapshot.devices, device],
        ports: [...snapshot.ports, ...ports],
        cables: [
          ...snapshot.cables,
          ...cables.filter((cable) => !known.has(cable.id)),
        ],
      });
    }

    case "device.patch": {
      const index = snapshot.devices.findIndex(
        (device) => device.id === operation.deviceId,
      );
      if (index === -1) return unchanged(snapshot, "missing-device");

      const devices = [...snapshot.devices];
      const device = devices[index];
      devices[index] = { ...device, ...operation.patch };

      return changed({ ...snapshot, devices });
    }

    case "device.delete": {
      const device = snapshot.devices.find(
        (item) => item.id === operation.deviceId,
      );
      if (!device) return unchanged(snapshot, "missing-device");
      // Its integration would bring it back at the next sync.
      if (device.source) return unchanged(snapshot, "source-owned");

      return changed(withoutDevice(snapshot, device, "delete"));
    }

    case "device.place": {
      const existing = snapshot.devices.find(
        (device) => device.id === operation.device.id,
      );
      if (existing) {
        return sameJson(placementOf(existing), placementOf(operation.device))
          ? unchanged(snapshot, "already-exists")
          : unchanged(snapshot, "conflict");
      }
      return changed({
        ...snapshot,
        devices: [...snapshot.devices, operation.device],
      });
    }

    case "device.unplace": {
      const device = snapshot.devices.find(
        (item) => item.id === operation.deviceId,
      );
      if (!device) return unchanged(snapshot, "missing-device");
      return changed(withoutDevice(snapshot, device, "keep"));
    }

    case "walls.add": {
      const existingIds = new Map(
        snapshot.walls.map((wall) => [wall.id, wall]),
      );
      const existingGeometry = new Set(
        snapshot.walls.map((wall) => `${wall.floorId}:${wall.geometryKey}`),
      );
      const nextWalls = [...snapshot.walls];
      let applied = false;

      for (const wall of operation.walls) {
        const existing = existingIds.get(wall.id);
        if (existing) {
          if (!sameJson(existing, wall)) {
            return unchanged(snapshot, "conflict");
          }
          continue;
        }

        const geometryKey = `${wall.floorId}:${wall.geometryKey}`;
        if (existingGeometry.has(geometryKey)) {
          continue;
        }
        existingGeometry.add(geometryKey);
        nextWalls.push(wall);
        applied = true;
      }

      return applied
        ? changed({ ...snapshot, walls: nextWalls })
        : unchanged(snapshot, "duplicate-wall-geometry");
    }

    case "walls.delete": {
      const deleteIds = new Set(operation.wallIds);
      const nextWalls = snapshot.walls.filter(
        (wall) => !deleteIds.has(wall.id),
      );
      return nextWalls.length === snapshot.walls.length
        ? unchanged(snapshot, "missing-wall")
        : changed({ ...snapshot, walls: nextWalls });
    }

    case "overlay.set": {
      if (operation.floorId !== snapshot.floorId) {
        return unchanged(snapshot, "wrong-floor");
      }
      const current = snapshot.overlay;
      const next = operation.overlay;
      if (!current && !next) return unchanged(snapshot, "missing-overlay");
      if (current && next && sameOverlay(current, next)) {
        return unchanged(snapshot, "already-exists");
      }
      if (current?.locked) return unchanged(snapshot, "overlay-locked");
      if (next && (next.floorId !== operation.floorId || overlayError(next))) {
        return unchanged(snapshot, "invalid-overlay");
      }
      return changed({ ...snapshot, overlay: next });
    }

    case "overlay.patch": {
      if (operation.floorId !== snapshot.floorId) {
        return unchanged(snapshot, "wrong-floor");
      }
      const current = snapshot.overlay;
      if (!current) return unchanged(snapshot, "missing-overlay");
      if (isPatchBlockedByLock(current, operation.patch)) {
        return unchanged(snapshot, "overlay-locked");
      }
      const next = applyOverlayPatch(current, operation.patch);
      if (overlayError(next)) return unchanged(snapshot, "invalid-overlay");
      return changed({ ...snapshot, overlay: next });
    }

    case "batch":
      return applyBatch(
        snapshot,
        operation.meta,
        operation.operations.map((item) =>
          withParentMeta(item, operation.meta),
        ),
      );
  }
}

export function applyOperations(
  snapshot: MapDocumentSnapshot,
  operations: ReadonlyArray<MapOperation>,
): ApplyOperationResult {
  let next = snapshot;
  let applied = false;
  let reason: ApplyOperationReason | undefined;

  for (const operation of operations) {
    const result = applyOperation(next, operation);
    next = result.snapshot;
    applied = applied || result.applied;
    reason = reason ?? result.reason;
  }

  return { snapshot: next, applied, reason };
}
