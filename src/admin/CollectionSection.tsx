import { useQuery } from "convex/react";
import { Time } from "@/components/time";
import { cn } from "@/lib/utils";
import { CollectionFreshness } from "@/sites/CollectionFreshness";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import { api } from "../../convex/_generated/api";

const origin = (manual: boolean) => (manual ? "manuelle" : "automatique");

/**
 * What the site's collection cycles did last, source by source, under the
 * freshness every user sees.
 */
export function CollectionSection({ siteId }: { siteId: string }) {
  const status = useQuery(api.collection.status, { siteId });
  if (status === undefined) return null;

  return (
    <section className="space-y-4 border-t pt-6">
      <div className="space-y-1">
        <h2 className="font-medium">Collecte</h2>
        <p className="text-sm text-muted-foreground">
          Chaque collecte interroge les intégrations actives, NetBox d'abord.
        </p>
      </div>
      <CollectionFreshness
        siteId={siteId}
        linkToSettings={false}
        className="max-w-md"
      />
      <div className="space-y-2 text-sm">
        {status.running ? (
          <p>
            Collecte {origin(status.running.manual)} en cours depuis{" "}
            <Time at={status.running.startedAt} />.
          </p>
        ) : null}
        {status.last ? (
          <div className="space-y-1">
            <p>
              Dernière collecte {origin(status.last.manual)} :{" "}
              <Time at={status.last.startedAt} />.
            </p>
            <ul className="space-y-1">
              {status.last.steps.map((step) => (
                <li
                  key={step.source}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      step.ok ? "bg-up" : "bg-down",
                    )}
                  />
                  <span>
                    {INTEGRATION_LABELS[step.source]} : {step.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Aucune collecte pour l'instant.
          </p>
        )}
        {status.failures > 1 ? (
          <p className="text-muted-foreground">
            {status.failures} échecs de suite : les essais s'espacent.
          </p>
        ) : null}
      </div>
    </section>
  );
}
