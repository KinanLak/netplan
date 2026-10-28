import { useQuery } from "convex/react";
import { useOnlineMutation } from "@/hooks/use-online-mutation";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";
import { LockIcon } from "@hugeicons/core-free-icons";
import { IconNote } from "@/components/icon-note";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { failureMessage } from "@/lib/errors";
import { useCurrentUser } from "@/hooks/use-current-user";
import { isAdmin } from "@/lib/roles";
import { api } from "../../convex/_generated/api";

type Review = FunctionReturnType<typeof api.importReviews.listForSite>[number];

/**
 * The NetBox devices the last import could not merge on its own, for an
 * Éditeur to settle; a conflict waits for an admin (ADR 0022).
 */
export function ImportReviews({ siteId }: { siteId: string }) {
  const reviews = useQuery(api.importReviews.listForSite, { siteId });
  if (!reviews || reviews.length === 0) return null;
  return (
    <section
      aria-labelledby="import-reviews"
      className="space-y-3 rounded-lg border p-4"
    >
      <h2 id="import-reviews" className="font-medium">
        À vérifier après l'import NetBox ({reviews.length})
      </h2>
      <ul className="divide-y">
        {reviews.map((review) => (
          <ReviewItem
            key={review.device.externalId}
            siteId={siteId}
            review={review}
          />
        ))}
      </ul>
    </section>
  );
}

function ReviewItem({ siteId, review }: { siteId: string; review: Review }) {
  const me = useCurrentUser();
  const resolve = useOnlineMutation(api.importReviews.resolve);
  const [pending, setPending] = useState(false);
  const { device, candidates } = review;
  const [chosen, setChosen] = useState<string | null>(null);
  const canDecide = review.kind === "suggestion" || isAdmin(me?.role);

  const settle = async (deviceId: string | null) => {
    setPending(true);
    try {
      await resolve({ siteId, externalId: device.externalId, deviceId });
    } catch (failure) {
      toast.error(failureMessage(failure, "editor"));
    } finally {
      setPending(false);
    }
  };

  const details = [
    getDeviceKindLabel(device.type),
    device.serial ? `n° ${device.serial}` : null,
    device.macs.length > 0 ? device.macs.join(", ") : null,
  ].filter(Boolean);
  // The chosen candidate may be bound or deleted meanwhile, by this page too.
  const match =
    candidates.find((candidate) => candidate.id === chosen) ?? candidates.at(0);

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-0.5 text-sm">
        <p>
          <span className="font-medium">{device.name}</span>{" "}
          {review.kind === "suggestion" && match
            ? `porte le nom d'hôte de « ${match.name} ».`
            : candidates.length > 1
              ? "correspond à plusieurs équipements."
              : candidates.length === 1
                ? `correspond à « ${candidates[0]?.name} », qui le contredit.`
                : "ne correspond plus à aucun équipement."}
        </p>
        <p className="truncate text-muted-foreground">
          {details.join(" · ")}
          {device.url ? (
            <>
              {" · "}
              <a
                href={device.url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Voir dans NetBox
              </a>
            </>
          ) : null}
        </p>
      </div>
      {canDecide ? (
        <div className="flex flex-wrap items-center gap-2">
          {review.kind === "conflict" && candidates.length > 1 ? (
            <Select
              items={candidates.map((candidate) => ({
                value: candidate.id,
                label: candidate.name,
              }))}
              value={match?.id ?? null}
              onValueChange={setChosen}
            >
              <SelectTrigger
                aria-label={`Équipement à rattacher à ${device.name}`}
                className="w-48"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {match ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => void settle(match.id)}
            >
              Rattacher
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void settle(null)}
          >
            {review.kind === "suggestion"
              ? "Garder séparés"
              : "Importer séparément"}
          </Button>
        </div>
      ) : (
        <IconNote icon={LockIcon}>Réservé aux administrateurs</IconNote>
      )}
    </li>
  );
}
