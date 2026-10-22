import type { DeviceStatus, DeviceType } from "@/types/map";

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  up: "En ligne",
  down: "Hors ligne",
  unknown: "Inconnu",
  stale: "Plus de nouvelles",
};

/**
 * Each status's colour tokens (ADR 0029). A new status gets a token pair of
 * its own in `styles.css` and its classes here.
 */
export const DEVICE_STATUS_CLASSES: Record<
  DeviceStatus,
  { dot: string; border: string; text: string; badge: string }
> = {
  up: {
    dot: "bg-up",
    border: "border-up",
    text: "text-up",
    badge: "border-up bg-up-background text-up",
  },
  down: {
    dot: "bg-down",
    border: "border-down",
    text: "text-down",
    badge: "border-down bg-down-background text-down",
  },
  unknown: {
    dot: "bg-unknown",
    border: "border-unknown",
    text: "text-unknown",
    badge: "border-unknown bg-unknown-background text-unknown",
  },
  // No news (ADR 0032): the unknown's tokens, the dot hollow.
  stale: {
    dot: "border-[1.5px] border-unknown",
    border: "border-unknown",
    text: "text-unknown",
    badge: "border-unknown bg-unknown-background text-unknown",
  },
};

/**
 * Only what the network observes has a status (B13): sockets, patch panels
 * and racks are passive, so they show no dot and stay out of status counts.
 */
const WITH_STATUS: ReadonlySet<DeviceType> = new Set([
  "pc",
  "endpoint",
  "switch",
]);

export const hasStatus = (type: DeviceType): boolean => WITH_STATUS.has(type);
