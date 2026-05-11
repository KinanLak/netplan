import { useLayoutEffect, useState } from "react";
import type { DeviceId, FloorId, Position, Size } from "@/types/map";
import { createDevicePlacement } from "./devicePlacement";

type CheckCollision = (
  floorId: FloorId,
  deviceId: DeviceId,
  position: Position,
  size: Size,
) => boolean;

export const useDevicePlacement = (checkCollision: CheckCollision) => {
  const [devicePlacement] = useState(() => {
    let currentCheckCollision = checkCollision;
    return {
      placement: createDevicePlacement({
        checkCollision: (...args) => currentCheckCollision(...args),
      }),
      setCheckCollision: (nextCheckCollision: CheckCollision) => {
        currentCheckCollision = nextCheckCollision;
      },
    };
  });

  useLayoutEffect(() => {
    devicePlacement.setCheckCollision(checkCollision);
  }, [checkCollision, devicePlacement]);

  return devicePlacement.placement;
};
