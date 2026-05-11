import { describe, expect, it } from "bun:test";
import { renderHook } from "@testing-library/react";
import type { DeviceId, FloorId } from "@/types/map";
import { useDevicePlacement } from "./useDevicePlacement";

const floorId = "floor-a" as FloorId;
const deviceId = "device-a" as DeviceId;

describe("useDevicePlacement", () => {
  it("uses the latest collision function without recreating placement state", () => {
    let blockedX = 20;
    const { result, rerender } = renderHook(() =>
      useDevicePlacement((_, __, position) => position.x === blockedX),
    );

    const firstPlacement = result.current;
    blockedX = 40;
    rerender();

    expect(result.current).toBe(firstPlacement);
    expect(
      result.current.resolve({
        kind: "drag",
        deviceId,
        floorId,
        requestedPosition: { x: 40, y: 0 },
        startPosition: { x: 0, y: 0 },
        size: { width: 20, height: 20 },
      }),
    ).toMatchObject({
      ok: true,
      position: { x: 20, y: 0 },
      status: "relocated",
    });
  });
});
