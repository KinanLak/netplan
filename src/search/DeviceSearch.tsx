import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { create } from "zustand";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { matchesDeviceSearch, rankDeviceMatches } from "@/devices/search";
import { cn } from "@/lib/utils";
import { useSiteDeviceLocator } from "@/search/useSiteDeviceLocator";
import type { SiteDevice } from "@/search/useSiteDeviceLocator";

const SHOWN = 8;

/**
 * Ctrl+K asks for the search field. The map holds the shortcut, so it works
 * with the sidebar folded or, on a phone, unmounted; the field takes the
 * focus once it is there and interactive.
 */
export const useDeviceSearchFocus = create<{
  pending: boolean;
  request: () => void;
  done: () => void;
}>((set) => ({
  pending: false,
  request: () => set({ pending: true }),
  done: () => set({ pending: false }),
}));

/**
 * Finds a device of the site by name, hostname, IP or MAC, from the sidebar
 * (Ctrl+K). A placed result opens its floor, comes into view and shows its
 * drawer; one on no floor leads to the inventory.
 */
export function DeviceSearch() {
  const { site, devices, locate } = useSiteDeviceLocator();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const navigate = useNavigate();
  const focusPending = useDeviceSearchFocus((state) => state.pending);
  useEffect(() => {
    if (!focusPending) return;
    // After the sidebar has unfolded and is no longer inert.
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
      useDeviceSearchFocus.getState().done();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPending]);

  const matches = rankDeviceMatches(devices ?? [], query, matchesDeviceSearch);
  const shown = matches.slice(0, SHOWN);
  const activeIndex = Math.min(active, Math.max(shown.length - 1, 0));

  const close = () => {
    setQuery("");
    setActive(0);
  };

  const pick = (device: SiteDevice) => {
    close();
    inputRef.current?.blur();
    if (device.location) {
      locate(device, { select: true });
    } else {
      void navigate({
        to: "/inventory",
        search: site ? { site: site.id } : {},
      });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive(
        (activeIndex + step + shown.length) % Math.max(shown.length, 1),
      );
    } else if (event.key === "Enter") {
      const device = shown.at(activeIndex);
      if (device) pick(device);
    } else if (event.key === "Escape") {
      close();
      inputRef.current?.blur();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="relative flex items-center">
        <span className="sr-only">Rechercher un équipement</span>
        <HugeiconsIcon
          icon={Search01Icon}
          size={14}
          strokeWidth={1.5}
          className="pointer-events-none absolute left-2 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls={listId}
          aria-activedescendant={
            shown.length > 0 ? `${listId}-${activeIndex}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Rechercher un équipement"
          className="h-8 w-full rounded-md border border-sidebar-border bg-background pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        />
      </label>
      {query.trim() ? (
        <ul id={listId} role="listbox" className="flex flex-col">
          {shown.map((device, index) => (
            <li
              key={device.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              {device.location ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(device)}
                  className={cn(
                    "flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-sm",
                    index === activeIndex && "bg-sidebar-accent",
                  )}
                >
                  <SearchResultName device={device} />
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {device.location.floorName}
                  </span>
                </button>
              ) : (
                <Link
                  to="/inventory"
                  search={site ? { site: site.id } : {}}
                  tabIndex={-1}
                  className={cn(
                    "flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-sm",
                    index === activeIndex && "bg-sidebar-accent",
                  )}
                >
                  <SearchResultName device={device} />
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    Hors plan
                  </span>
                </Link>
              )}
            </li>
          ))}
          {matches.length > SHOWN ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              {matches.length - SHOWN} autres
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function SearchResultName({ device }: { device: SiteDevice }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{device.name}</span>
      {device.hostname && device.hostname !== device.name ? (
        <span className="truncate font-mono text-xs text-muted-foreground">
          {device.hostname}
        </span>
      ) : null}
    </span>
  );
}
