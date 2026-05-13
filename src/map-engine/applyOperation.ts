import type { MapDocumentSnapshot } from "@/types/map";
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

const withoutConnectedLinks = (
  snapshot: MapDocumentSnapshot,
  deviceId: string,
) =>
  snapshot.links.filter(
    (link) => link.fromDeviceId !== deviceId && link.toDeviceId !== deviceId,
  );

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
): MapOperation => ({ ...operation, meta }) as MapOperation;

const isSafeBatchNoop = (
  operation: MapOperation,
  reason: ApplyOperationReason,
): boolean => {
  switch (operation.kind) {
    case "device.create":
    case "link.create":
      return reason === "already-exists";
    case "device.delete":
      return reason === "missing-device";
    case "link.delete":
      return reason === "missing-link";
    case "walls.add":
      return reason === "duplicate-wall-geometry";
    case "walls.delete":
      return reason === "missing-wall";
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

      return changed({
        ...snapshot,
        devices: [...snapshot.devices, operation.device],
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
      const exists = snapshot.devices.some(
        (device) => device.id === operation.deviceId,
      );
      if (!exists) return unchanged(snapshot, "missing-device");

      return changed({
        ...snapshot,
        devices: snapshot.devices.filter(
          (device) => device.id !== operation.deviceId,
        ),
        links: withoutConnectedLinks(snapshot, operation.deviceId),
      });
    }

    case "link.create": {
      const existing = snapshot.links.find(
        (link) => link.id === operation.link.id,
      );
      if (existing) {
        return sameJson(existing, operation.link)
          ? unchanged(snapshot, "already-exists")
          : unchanged(snapshot, "conflict");
      }

      const from = snapshot.devices.find(
        (device) => device.id === operation.link.fromDeviceId,
      );
      const to = snapshot.devices.find(
        (device) => device.id === operation.link.toDeviceId,
      );
      if (!from || !to) return unchanged(snapshot, "missing-endpoint");
      if (
        from.floorId !== operation.link.floorId ||
        to.floorId !== operation.link.floorId
      ) {
        return unchanged(snapshot, "cross-floor-link");
      }

      return changed({
        ...snapshot,
        links: [...snapshot.links, operation.link],
      });
    }

    case "link.delete": {
      const nextLinks = snapshot.links.filter(
        (link) => link.id !== operation.linkId,
      );
      return nextLinks.length === snapshot.links.length
        ? unchanged(snapshot, "missing-link")
        : changed({ ...snapshot, links: nextLinks });
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
