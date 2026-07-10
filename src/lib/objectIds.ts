import type {
  BuildingId,
  DeviceId,
  FloorId,
  LinkId,
  ObjectId,
  WallId,
} from "@/types/map";

export const asObjectId = (value: string): ObjectId => value as ObjectId;
export const asBuildingId = (value: string): BuildingId => value as BuildingId;
export const asFloorId = (value: string): FloorId => value as FloorId;
export const asDeviceId = (value: string): DeviceId => value as DeviceId;
export const asWallId = (value: string): WallId => value as WallId;
export const asLinkId = (value: string): LinkId => value as LinkId;
