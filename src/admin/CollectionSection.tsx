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
      <h2 className="font-medium">Dernières collectes</h2>
      <CollectionFreshness
        siteId={siteId}
        linkToSettings={false}
        className="max-w-md"
      />
      <div className="space-y-2 text-sm">
        {status.running ? (
          <p className="flex flex-wrap gap-x-2">
            <span>Collecte {origin(status.running.manual)} en cours</span>
            <span className="text-muted-foreground">
              depuis <Time at={status.running.startedAt} />
            </span>
          </p>
        ) : null}
        {status.last ? (
          <div className="space-y-1">
            <p className="flex flex-wrap gap-x-2">
              <span>Dernière collecte {origin(status.last.manual)}</span>
              <span className="text-muted-foreground">
                <Time at={status.last.startedAt} />
              </span>
            </p>
            <ul className="space-y-1">
              {status.last.steps.map((step) => (
                <li key={step.source} className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      step.ok ? "bg-up" : "bg-down",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">
                      {INTEGRATION_LABELS[step.source]}
                    </span>
                    <span className="ms-2 text-muted-foreground">
                      {step.message}
                    </span>
                    {/* The step counts; each switch in trouble says why. */}
                    {(step.switches ?? [])
                      .filter((entry) => !entry.ok || entry.notes.length > 0)
                      .map((entry, index) => (
                        <span
                          key={`${entry.name}-${index}`}
                          className="block ps-4"
                        >
                          {entry.name}
                          <span className="ms-2 text-muted-foreground">
                            {entry.notes.join(" ")}
                          </span>
                        </span>
                      ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {status.failures > 1 ? (
          <p className="text-down">{status.failures} échecs de suite</p>
        ) : null}
      </div>
    </section>
  );
}
