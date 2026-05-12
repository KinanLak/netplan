import type { MapDocumentSnapshot } from "@/types/map";
import { applyOperation } from "./applyOperation";
import type { MapOperation } from "./types";

const invertDevicePatch = (
  snapshot: MapDocumentSnapshot,
  operation: Extract<MapOperation, { kind: "device.patch" }>,
): MapOperation | null => {
  const device = snapshot.devices.find(
    (item) => item.id === operation.deviceId,
  );
  if (!device) return null;

  const patch: Extract<MapOperation, { kind: "device.patch" }>["patch"] = {};
  if (operation.patch.name !== undefined) patch.name = device.name;
  if (operation.patch.hostname !== undefined) patch.hostname = device.hostname;
  if (operation.patch.position !== undefined) patch.position = device.position;
  if (operation.patch.size !== undefined) patch.size = device.size;
  if (operation.patch.metadata !== undefined) patch.metadata = device.metadata;

  return {
    kind: "device.patch",
    meta: operation.meta,
    deviceId: operation.deviceId,
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

    case "device.delete": {
      const device = snapshotBeforeOperation.devices.find(
        (item) => item.id === operation.deviceId,
      );
      if (!device) return null;
      const links = snapshotBeforeOperation.links.filter(
        (link) =>
          link.fromDeviceId === operation.deviceId ||
          link.toDeviceId === operation.deviceId,
      );
      const operations: Array<MapOperation> = [
        { kind: "device.create", meta: operation.meta, device },
        ...links.map(
          (link): MapOperation => ({
            kind: "link.create",
            meta: operation.meta,
            link,
          }),
        ),
      ];
      return operations.length === 1
        ? operations[0]
        : { kind: "batch", meta: operation.meta, operations };
    }

    case "link.create":
      return {
        kind: "link.delete",
        meta: operation.meta,
        linkId: operation.link.id,
      };

    case "link.delete": {
      const link = snapshotBeforeOperation.links.find(
        (item) => item.id === operation.linkId,
      );
      return link ? { kind: "link.create", meta: operation.meta, link } : null;
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

    case "batch": {
      const inverses: Array<MapOperation> = [];
      let currentSnapshot = snapshotBeforeOperation;
      for (const subOperation of operation.operations) {
        const inverse = buildInverseOperation(currentSnapshot, subOperation);
        if (inverse) inverses.unshift(inverse);
        currentSnapshot = applyOperation(
          currentSnapshot,
          subOperation,
        ).snapshot;
      }
      if (inverses.length === 0) return null;
      return inverses.length === 1
        ? inverses[0]
        : { kind: "batch", meta: operation.meta, operations: inverses };
    }
  }
}
