import { rectanglesOverlap } from "@/lib/geometry";
import type { Device, MapDocumentSnapshot, Position, Size } from "@/types/map";
import { getWallCollisionRect } from "@/walls/gridGeometry";
import { groupMoveRefusal } from "./groupMove";
import type { MapOperation } from "./types";

export type ValidationError =
  | "device-collision"
  | "wall-collision"
  | "wall-crossing"
  | "missing-device";

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

/** Whether devices of one floor may move by `offset` as one block. */
export function validateGroupMove(
  snapshot: MapDocumentSnapshot,
  deviceIds: ReadonlyArray<Device["id"]>,
  offset: Position,
): ValidationResult {
  const ids = new Set<string>(deviceIds);
  const members = snapshot.devices.filter((device) => ids.has(device.id));
  if (members.length === 0 || members.length !== ids.size) {
    return invalid("missing-device");
  }
  const [first] = members;
  const rect = ({ position, size }: Device) => ({ ...position, ...size });
  const refusal = groupMoveRefusal(members.map(rect), offset, {
    devices: snapshot.devices
      .filter(
        (device) => device.floorId === first.floorId && !ids.has(device.id),
      )
      .map(rect),
    walls: snapshot.walls
      .filter((wall) => wall.floorId === first.floorId)
      .map(getWallCollisionRect),
  });
  return refusal ? invalid(refusal) : valid();
}

export function validateOperation(
  snapshot: MapDocumentSnapshot,
  operation: MapOperation,
): ValidationResult {
  switch (operation.kind) {
    case "device.create":
    case "device.place":
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

    case "devices.move":
      return validateGroupMove(
        snapshot,
        operation.from.map((member) => member.deviceId),
        operation.offset,
      );

    case "batch": {
      for (const subOperation of operation.operations) {
        const result = validateOperation(snapshot, {
          ...subOperation,
          meta: operation.meta,
        });
        if (!result.valid) return result;
      }
      return valid();
    }

    case "device.delete":
    case "device.unplace":
    case "walls.add":
    case "walls.delete":
    case "overlay.set":
    case "overlay.patch":
    case "label.create":
    case "label.patch":
    case "label.delete":
      return valid();
  }
}
