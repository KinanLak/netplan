import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { useCanEdit } from "@/hooks/use-current-user";
import { failureMessage } from "@/lib/errors";
import type { SiteFreshness } from "@/sites/freshness";
import { api } from "../../convex/_generated/api";

/**
 * The cycles this page started, by site, so their end is told to the person
 * who asked whichever page they are on by then (ADR 0026).
 */
export const usePendingRefreshes = create<{
  bySite: Record<string, number>;
  start: (siteId: string, startedAt: number) => void;
  settle: (siteId: string) => void;
}>((set) => ({
  bySite: {},
  start: (siteId, startedAt) =>
    set((state) => ({ bySite: { ...state.bySite, [siteId]: startedAt } })),
  settle: (siteId) =>
    set((state) => {
      const { [siteId]: _settled, ...bySite } = state.bySite;
      return { bySite };
    }),
}));

/** Whether "Actualiser" is offered at all: the role, the site, a source. */
export const offersRefresh = (
  canEdit: boolean,
  freshness: SiteFreshness | null | undefined,
): boolean =>
  canEdit && Boolean(freshness?.hasSources && freshness.manualRefresh);

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
      toast.info("Une collecte est déjà en cours pour ce site.");
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
