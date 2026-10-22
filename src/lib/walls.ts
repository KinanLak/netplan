import type { WallColor } from "@/types/map";

export interface WallColorTone {
  label: string;
  fill: string;
  stroke: string;
}

export const WALL_COLOR_TONES: Record<WallColor, WallColorTone> = {
  sand: {
    label: "Sable",
    fill: "var(--wall-sand-fill)",
    stroke: "var(--wall-sand-stroke)",
  },
  concrete: {
    label: "Béton",
    fill: "var(--wall-concrete-fill)",
    stroke: "var(--wall-concrete-stroke)",
  },
  slate: {
    label: "Ardoise",
    fill: "var(--wall-slate-fill)",
    stroke: "var(--wall-slate-stroke)",
  },
};

export const WALL_COLOR_ORDER: Array<WallColor> = ["sand", "concrete", "slate"];
