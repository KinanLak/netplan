import { useState } from "react";

// Air between the sticky filters and the table's header, and the least
// height a table keeps on a short window.
const GAP = 8;
const MIN_HEIGHT = 240;

/**
 * How tall the devices table may be so that, scrolled fully into view, it
 * starts below the sticky filters instead of under them (A63). The filters
 * wrap onto more lines on a narrow window, so this is measured, not fixed:
 * the scrolling page's height less the filters' and the page's bottom
 * padding. `null` until measured.
 *
 * `measureFilters` is the sticky filters' ref, inside the page's `<main>`.
 */
export function useTableRoom() {
  const [room, setRoom] = useState<number | null>(null);
  const measureFilters = (filters: HTMLElement | null) => {
    const page = filters?.closest("main");
    if (!filters || !page) return;
    const measure = () => {
      const content = page.firstElementChild ?? page;
      const padding =
        Number.parseFloat(getComputedStyle(content).paddingBottom) || 0;
      setRoom(
        Math.max(
          MIN_HEIGHT,
          page.clientHeight - filters.offsetHeight - padding - GAP,
        ),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(filters);
    observer.observe(page);
    return () => observer.disconnect();
  };
  return { measureFilters, room };
}
