import { useState } from "react";
import type { DeviceId, FloorId, Position, Size } from "@/types/map";
import { createDevicePlacement } from "./devicePlacement";

type CheckCollision = (
  floorId: FloorId,
  deviceId: DeviceId | string,
  position: Position,
  size: Size,
) => boolean;

export const useDevicePlacement = (checkCollision: CheckCollision) => {
  const [devicePlacement] = useState(() =>
    createDevicePlacement({ checkCollision }),
  );

  return devicePlacement;
};
