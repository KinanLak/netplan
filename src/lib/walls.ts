import type { WallColor } from "@/types/map";

export interface WallColorTone {
  label: string;
  fill: string;
  stroke: string;
}

export const WALL_COLOR_TONES: Record<WallColor, WallColorTone> = {
  sand: {
    label: "Sable",
    fill: "#d8c8b2",
    stroke: "#b59b7b",
  },
  concrete: {
    label: "Beton",
    fill: "#c3c8cf",
    stroke: "#8f98a3",
  },
  slate: {
    label: "Ardoise",
    fill: "#8f969f",
    stroke: "#5f6772",
  },
};

export const WALL_COLOR_ORDER: Array<WallColor> = ["sand", "concrete", "slate"];
