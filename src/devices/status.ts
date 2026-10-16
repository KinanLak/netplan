import type { DeviceStatus } from "@/types/map";

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  up: "En ligne",
  down: "Hors ligne",
  unknown: "Inconnu",
};
