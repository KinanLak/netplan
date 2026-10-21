import { useElementScrollRestoration } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/**
 * Puts the box marked `data-scroll-restoration-id={id}` back where it was
 * when the reader left, once `ready`: the router restores before the query
 * answers, when the rows are not there to scroll to yet.
 */
export function useRestoredScroll(id: string, ready: boolean) {
  const entry = useElementScrollRestoration({ id });
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    if (!entry) return;
    document
      .querySelector(`[data-scroll-restoration-id="${id}"]`)
      ?.scrollTo(entry.scrollX, entry.scrollY);
  }, [id, ready, entry]);
}
