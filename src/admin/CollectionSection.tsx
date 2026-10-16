import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { adminErrorMessage } from "@/admin/errors";
import { cn } from "@/lib/utils";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import { api } from "../../convex/_generated/api";

const when = (at: number) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(at);

const origin = (manual: boolean) => (manual ? "manuelle" : "automatique");

/** What the site's collection cycles did last and when the next one runs. */
export function CollectionSection({
  siteId,
  automaticRefresh,
  manualRefresh,
}: {
  siteId: string;
  automaticRefresh: boolean;
  manualRefresh: boolean;
}) {
  const status = useQuery(api.collection.status, { siteId });
  const refresh = useMutation(api.collection.refresh);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status === undefined) return null;

  const start = async () => {
    setPending(true);
    setError(null);
    try {
      await refresh({ siteId });
    } catch (failure) {
      setError(adminErrorMessage(failure));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="space-y-4 border-t pt-6">
      <div className="space-y-1">
        <h2 className="font-medium">Collecte</h2>
        <p className="text-sm text-muted-foreground">
          Chaque collecte interroge les intégrations actives, NetBox d'abord.
        </p>
      </div>
      <div className="space-y-2 text-sm" role="status">
        {status.paused ? (
          <p className="text-destructive">
            La collecte est suspendue sur ce serveur.
          </p>
        ) : null}
        {status.running ? (
          <p>
            Collecte {origin(status.running.manual)} en cours depuis{" "}
            {when(status.running.startedAt)}.
          </p>
        ) : null}
        {status.last ? (
          <div className="space-y-1">
            <p>
              Dernière collecte {origin(status.last.manual)} :{" "}
              {when(status.last.startedAt)}.
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
        <p className="text-muted-foreground">
          {!automaticRefresh
            ? "La collecte automatique est désactivée."
            : status.nextRunAt === null
              ? "La première collecte démarre dans la minute où une intégration est active."
              : `Prochaine collecte automatique : ${when(status.nextRunAt)}.`}
          {status.failures > 1
            ? ` ${status.failures} échecs de suite : les essais s'espacent.`
            : null}
        </p>
      </div>
      {manualRefresh ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending || status.running !== null || status.paused}
            onClick={() => void start()}
          >
            {status.running ? "Collecte en cours…" : "Lancer une collecte"}
          </Button>
          {error ? <FieldError>{error}</FieldError> : null}
        </div>
      ) : null}
    </section>
  );
}
