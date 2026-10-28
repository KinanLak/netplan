import { cn } from "@/lib/utils";
import { useIsMapFindOpen } from "@/search/MapFind";

/**
 * Where a drawing tool's message sits: under the map's top bar, which may span
 * the whole width, and on the left, clear of the drawer on the right (A14).
 * The find bar (Ctrl+F) may reach the left on a narrow screen with the
 * drawer open, so the help steps under it while it shows.
 */
export const useDrawingHelpClass = (): string =>
  cn(
    "absolute left-4 z-20 max-w-80 rounded-md border bg-card px-3 py-2 text-xs shadow-md",
    useIsMapFindOpen() ? "top-30" : "top-18",
  );
