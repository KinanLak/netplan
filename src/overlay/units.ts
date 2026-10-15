import { PLAN_UNITS_PER_METRE } from "@/lib/grid";
import { OVERLAY_MAX_SCALE, OVERLAY_MIN_SCALE } from "@/map-engine/overlay";
import type { FloorOverlay } from "@/types/map";

/** A number typed the French way ("12,5") or not ("12.5"); null if neither. */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const decimalFormat = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
  useGrouping: false,
});

export function formatDecimal(value: number): string {
  return decimalFormat.format(value);
}

/** The calque's width on the plan, in metres. */
export function overlayWidthMetres(overlay: FloorOverlay): number {
  return (overlay.imageWidth * overlay.scale) / PLAN_UNITS_PER_METRE;
}

/** The scale that makes the calque `metres` wide, or null if out of range. */
export function scaleForWidthMetres(
  overlay: FloorOverlay,
  metres: number,
): number | null {
  const scale = (metres * PLAN_UNITS_PER_METRE) / overlay.imageWidth;
  return Number.isFinite(scale) &&
    scale >= OVERLAY_MIN_SCALE &&
    scale <= OVERLAY_MAX_SCALE
    ? scale
    : null;
}
