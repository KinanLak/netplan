import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFlash } from "@/hooks/use-flash";
import { failureMessage } from "@/lib/errors";
import type { DeviceId } from "@/types/map";
import { api } from "../../../convex/_generated/api";

const names = (count: number) => `${count} ${count > 1 ? "noms" : "nom"}`;

/**
 * LibreNMS's port names for a manual switch that still has the default ones,
 * proposed rather than taken (ADR 0038): a shift of one position would
 * rename every port. Shown in edit mode only, so never to a Lecteur.
 */
export function PortNamesOffer({ deviceId }: { deviceId: DeviceId }) {
  const offer = useQuery(api.librenms.portNameOffer, { deviceId });
  const adopt = useMutation(api.librenms.adoptPortNames);
  const [pending, setPending] = useState(false);
  const [adopted, setAdopted] = useState(0);
  const [done, flashDone] = useFlash();

  if (done) {
    // The offer is gone with the default names; this says it took.
    return (
      <p className="text-xs text-muted-foreground">
        {names(adopted)} de LibreNMS adoptés
      </p>
    );
  }
  if (!offer) return null;

  const run = async () => {
    setPending(true);
    try {
      setAdopted(await adopt({ deviceId }));
      flashDone();
    } catch (failure) {
      toast.error(failureMessage(failure, "editor"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => void run()}
      className="w-full"
    >
      Adopter les {names(offer.count)} de LibreNMS
    </Button>
  );
}
