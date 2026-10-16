import { deviceTypes } from "./deviceKindRegistry";
import type { DeviceType } from "@/types/map";

export interface TypeCoverage {
  type: DeviceType;
  placed: number;
  total: number;
}

/**
 * For each type the site has, how many of its devices stand on a floor, in
 * the registry's order so the summary does not reshuffle as counts change.
 */
export const coverageByType = (
  devices: ReadonlyArray<{ type: DeviceType; location: object | null }>,
): Array<TypeCoverage> =>
  deviceTypes.flatMap((type) => {
    const ofType = devices.filter((device) => device.type === type);
    if (ofType.length === 0) return [];
    const placed = ofType.filter((device) => device.location !== null).length;
    return [{ type, placed, total: ofType.length }];
  });
