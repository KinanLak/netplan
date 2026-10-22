import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { KeyboardEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { matchesDeviceName, rankDeviceMatches } from "@/devices/search";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { cn } from "@/lib/utils";
import { useSiteDeviceLocator } from "@/search/useSiteDeviceLocator";
import { useMapStore } from "@/store/useMapStore";

/**
 * The find bar's state, outside the map workspace: a match in another
 * building unmounts the workspace while that building loads.
 */
const useMapFindState = create<{
  open: boolean;
  query: string;
  index: number;
  set: (
    patch: Partial<{ open: boolean; query: string; index: number }>,
  ) => void;
}>((set) => ({
  open: false,
  query: "",
  index: 0,
  set: (patch) => set(patch),
}));

/**
 * Ctrl+F on the map: a small find bar that moves the view to the device
 * whose name or hostname holds the query, on whatever floor, without
 * opening anything. Enter goes to the next one (ADR 0030).
 */
export function MapFind({
  hasRightDrawerOpen,
}: {
  hasRightDrawerOpen: boolean;
}) {
  const { devices, locate } = useSiteDeviceLocator();
  const { open, query, index, set } = useMapFindState();
  const inputRef = useRef<HTMLInputElement>(null);
  // Back after a building loaded, the bar keeps the focus it had.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const placed = (devices ?? []).filter((device) => device.location);
  const matches = rankDeviceMatches(placed, query, matchesDeviceName);

  const goTo = (next: number) => {
    const device = matches.at(next);
    if (!device) return;
    set({ index: next });
    locate(device, { select: false });
  };

  useShortcutIntentEffect("find-device", () => {
    // The calque and placing panels hold the same corner.
    useMapStore.getState().setOverlayPanelOpen(false);
    useMapStore.getState().setPlacePanelOpen(false);
    set({ open: true });
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  });

  if (!open) return null;

  const close = () => set({ open: false, query: "", index: 0 });

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && matches.length > 0) {
      event.preventDefault();
      const step = event.shiftKey ? -1 : 1;
      goTo((index + step + matches.length) % matches.length);
    } else if (event.key === "Escape") {
      close();
    } else if ((event.ctrlKey || event.metaKey) && event.key === "f") {
      // A second Ctrl+F selects the query rather than the browser's find.
      event.preventDefault();
      inputRef.current?.select();
    }
  };

  return (
    <div
      role="search"
      className={cn(
        // Under the map's top bar, which may span the whole width.
        "absolute top-18 z-30 flex items-center gap-1 rounded-lg border border-border bg-card py-1 pr-1 pl-2 shadow-lg transition-[right]",
        // On a phone the drawer fills the width: the bar goes over it.
        hasRightDrawerOpen ? "right-4 md:right-84" : "right-4",
      )}
    >
      <HugeiconsIcon
        icon={Search01Icon}
        size={14}
        strokeWidth={1.5}
        className="text-muted-foreground"
      />
      <input
        ref={inputRef}
        type="text"
        aria-label="Trouver un équipement sur le plan"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          set({ query: next, index: 0 });
          const first = rankDeviceMatches(placed, next, matchesDeviceName).at(
            0,
          );
          if (first) locate(first, { select: false });
        }}
        onKeyDown={onKeyDown}
        placeholder="Nom ou nom d'hôte"
        className="h-7 w-44 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <span
        className="min-w-10 text-right text-xs text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        {query.trim()
          ? matches.length > 0
            ? `${index + 1}/${matches.length}`
            : "0"
          : null}
      </span>
      <button
        type="button"
        onClick={close}
        aria-label="Fermer la recherche"
        className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
