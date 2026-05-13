import { rectanglesOverlap } from "@/lib/geometry";
import type { Device, MapDocumentSnapshot, Position, Size } from "@/types/map";
import { getWallCollisionRect } from "@/walls/gridGeometry";
import type { MapOperation } from "./types";

export type ValidationError =
  | "device-collision"
  | "wall-collision"
  | "missing-device"
  | "missing-endpoint"
  | "cross-floor-link";

export interface ValidationResult {
  valid: boolean;
  error?: ValidationError;
}

const valid = (): ValidationResult => ({ valid: true });
const invalid = (error: ValidationError): ValidationResult => ({
  valid: false,
  error,
});

export function collidesWithDevice(
  snapshot: MapDocumentSnapshot,
  floorId: Device["floorId"],
  deviceId: Device["id"] | null,
  position: Position,
  size: Size,
): boolean {
  return snapshot.devices.some(
    (device) =>
      device.floorId === floorId &&
      device.id !== deviceId &&
      rectanglesOverlap(position, size, device.position, device.size),
  );
}

export function collidesWithWall(
  snapshot: MapDocumentSnapshot,
  floorId: Device["floorId"],
  position: Position,
  size: Size,
): boolean {
  return snapshot.walls.some((wall) => {
    if (wall.floorId !== floorId) return false;
    const rect = getWallCollisionRect(wall);
    return rectanglesOverlap(
      position,
      size,
      { x: rect.x, y: rect.y },
      { width: rect.width, height: rect.height },
    );
  });
}

export function validateDevicePlacement(
  snapshot: MapDocumentSnapshot,
  device: Pick<Device, "floorId" | "id" | "position" | "size">,
): ValidationResult {
  if (
    collidesWithDevice(
      snapshot,
      device.floorId,
      device.id,
      device.position,
      device.size,
    )
  ) {
    return invalid("device-collision");
  }
  if (
    collidesWithWall(snapshot, device.floorId, device.position, device.size)
  ) {
    return invalid("wall-collision");
  }
  return valid();
}

export function validateOperation(
  snapshot: MapDocumentSnapshot,
  operation: MapOperation,
): ValidationResult {
  switch (operation.kind) {
    case "device.create":
      return validateDevicePlacement(snapshot, operation.device);

    case "device.patch": {
      const device = snapshot.devices.find(
        (item) => item.id === operation.deviceId,
      );
      if (!device) return invalid("missing-device");
      const position = operation.patch.position ?? device.position;
      const size = operation.patch.size ?? device.size;
      return validateDevicePlacement(snapshot, { ...device, position, size });
    }

    case "link.create": {
      const from = snapshot.devices.find(
        (device) => device.id === operation.link.fromDeviceId,
      );
      const to = snapshot.devices.find(
        (device) => device.id === operation.link.toDeviceId,
      );
      if (!from || !to) return invalid("missing-endpoint");
      if (
        from.floorId !== operation.link.floorId ||
        to.floorId !== operation.link.floorId
      ) {
        return invalid("cross-floor-link");
      }
      return valid();
    }

    case "batch": {
      for (const subOperation of operation.operations) {
        const result = validateOperation(snapshot, {
          ...subOperation,
          meta: operation.meta,
        } as MapOperation);
        if (!result.valid) return result;
      }
      return valid();
    }

    case "device.delete":
    case "link.delete":
    case "walls.add":
    case "walls.delete":
      return valid();
  }
}
