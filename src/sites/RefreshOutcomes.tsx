import { useQuery } from "convex/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { refreshOutcome } from "@/sites/freshness";
import { usePendingRefreshes } from "@/sites/useSiteRefresh";
import { api } from "../../convex/_generated/api";

function RefreshWatcher({
  siteId,
  startedAt,
}: {
  siteId: string;
  startedAt: number;
}) {
  const freshness = useQuery(api.collection.freshness, { siteId });
  useEffect(() => {
    if (freshness === undefined) return;
    const outcome = refreshOutcome(freshness, startedAt);
    if (outcome.kind === "pending") return;
    // A success shows on the button and in the freshness line, not a toast.
    usePendingRefreshes.getState().settle(siteId, outcome.kind === "succeeded");
    if (outcome.kind === "failed") {
      toast.error("L'actualisation a échoué", {
        description: `Échec côté ${outcome.sources}. Un administrateur en voit le détail.`,
      });
    }
    if (outcome.kind === "interrupted") {
      toast.error("L'actualisation s'est interrompue", {
        description: "Une nouvelle collecte est prévue.",
      });
    }
  }, [freshness, siteId, startedAt]);
  return null;
}

/**
 * Tells whoever pressed "Actualiser" when their cycle failed. Automatic cycles
 * stay silent: their failures show as late data.
 */
export function RefreshOutcomes() {
  const bySite = usePendingRefreshes((state) => state.bySite);
  return Object.entries(bySite).map(([siteId, startedAt]) => (
    <RefreshWatcher key={siteId} siteId={siteId} startedAt={startedAt} />
  ));
}
