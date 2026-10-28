import { useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { isAdmin } from "@/lib/roles";
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
  const admin = isAdmin(useCurrentUser()?.role);
  const router = useRouter();
  useEffect(() => {
    if (freshness === undefined) return;
    const outcome = refreshOutcome(freshness, startedAt);
    if (outcome.kind === "pending") return;
    // A success shows on the button and in the freshness line, not a toast.
    usePendingRefreshes.getState().settle(siteId, outcome.kind === "succeeded");
    if (outcome.kind === "failed") {
      // An Admin is the one who sees the detail: on Santé it is on screen,
      // elsewhere the toast leads there.
      const onHealth = router.state.location.pathname === "/admin/health";
      toast.error("L'actualisation a échoué", {
        description: `${outcome.sources} en échec`,
        action:
          admin && !onHealth
            ? {
                label: "Voir le détail",
                onClick: () => void router.navigate({ to: "/admin/health" }),
              }
            : undefined,
      });
    }
    if (outcome.kind === "interrupted") {
      toast.error("L'actualisation s'est interrompue");
    }
  }, [admin, freshness, router, siteId, startedAt]);
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
