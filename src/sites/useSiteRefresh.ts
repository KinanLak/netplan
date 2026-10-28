import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { useCanEdit } from "@/hooks/use-current-user";
import { failureMessage } from "@/lib/errors";
import type { SiteFreshness } from "@/sites/freshness";
import { api } from "../../convex/_generated/api";

// Long enough to be read, short enough not to linger on the next press.
const SUCCESS_SHOWN_MS = 1_500;

/**
 * The cycles this page started, by site, so their end is told to the person
 * who asked whichever page they are on by then (ADR 0026).
 */
export const usePendingRefreshes = create<{
  bySite: Record<string, number>;
  /** The sites whose cycle this page started just succeeded, for a moment. */
  succeeded: Record<string, true>;
  start: (siteId: string, startedAt: number) => void;
  settle: (siteId: string, succeeded?: boolean) => void;
}>((set) => ({
  bySite: {},
  succeeded: {},
  start: (siteId, startedAt) =>
    set((state) => ({ bySite: { ...state.bySite, [siteId]: startedAt } })),
  settle: (siteId, succeeded = false) => {
    set((state) => {
      const { [siteId]: _settled, ...bySite } = state.bySite;
      return succeeded
        ? { bySite, succeeded: { ...state.succeeded, [siteId]: true } }
        : { bySite };
    });
    if (!succeeded) return;
    window.setTimeout(
      () =>
        set((state) => {
          const { [siteId]: _shown, ...rest } = state.succeeded;
          return { succeeded: rest };
        }),
      SUCCESS_SHOWN_MS,
    );
  },
}));

/** Whether "Actualiser" is offered at all: the role, the site, a source. */
export const offersRefresh = (
  canEdit: boolean,
  freshness: SiteFreshness | null | undefined,
): boolean =>
  canEdit &&
  Boolean(
    freshness?.hasSources && freshness.manualRefresh && !freshness.archived,
  );

/** A site's freshness, and "Actualiser" for those who may press it. */
export function useSiteRefresh(siteId: string) {
  const freshness = useQuery(api.collection.freshness, { siteId });
  const refresh = useMutation(api.collection.refresh);
  const canEdit = useCanEdit();
  const [starting, setStarting] = useState(false);
  const offered = offersRefresh(canEdit, freshness);
  const busy = starting || Boolean(freshness?.running);

  const start = async () => {
    if (!offered || starting) return;
    if (freshness?.running) {
      // A fixed id, so pressing the shortcut again does not pile them up.
      toast.info("Collecte déjà en cours", {
        id: `refresh-running-${siteId}`,
      });
      return;
    }
    setStarting(true);
    try {
      const startedAt = await refresh({ siteId });
      usePendingRefreshes.getState().start(siteId, startedAt);
    } catch (error) {
      toast.error("Actualisation impossible", {
        description: failureMessage(error, "editor"),
      });
    } finally {
      setStarting(false);
    }
  };

  return { freshness, offered, busy, start };
}
