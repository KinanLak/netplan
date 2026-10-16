import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { IDENTITY_TEXT_LIMITS } from "@/devices/identity";
import { failureMessage } from "@/lib/errors";
import { createStandaloneObjectId } from "@/lib/identity";
import { api } from "../../convex/_generated/api";

type UnknownMac = FunctionReturnType<
  typeof api.unknownMacs.listForSite
>[number];

// A busy site sees many; the newest are the ones worth a look.
const SHOWN = 10;

const when = (at: number) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(at);

/**
 * MAC addresses the network sees that no device of the site carries, for an
 * Éditeur to turn into equipment (ADR 0022) or ignore (ADR 0026).
 */
export function UnknownMacs({ siteId }: { siteId: string }) {
  const unknown = useQuery(api.unknownMacs.listForSite, { siteId });
  const ignored = useQuery(api.unknownMacs.listIgnored, { siteId });
  const ignoreMac = useMutation(api.unknownMacs.ignore);
  const restoreMac = useMutation(api.unknownMacs.restore);
  const [all, setAll] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [creating, setCreating] = useState<UnknownMac | null>(null);
  if (!unknown || !ignored) return null;
  if (unknown.length === 0 && ignored.length === 0) return null;
  const shown = all ? unknown : unknown.slice(0, SHOWN);

  const restore = async (mac: string) => {
    try {
      await restoreMac({ siteId, mac });
    } catch (error) {
      toast.error(failureMessage(error, "editor"));
    }
  };
  const ignore = async (mac: string) => {
    try {
      await ignoreMac({ siteId, mac });
      toast(`${mac} ignorée`, {
        action: { label: "Annuler", onClick: () => void restore(mac) },
        duration: 10_000,
      });
    } catch (error) {
      toast.error(failureMessage(error, "editor"));
    }
  };

  return (
    <section
      aria-labelledby="unknown-macs"
      className="space-y-3 rounded-lg border p-4"
    >
      <div className="space-y-1">
        <h2 id="unknown-macs" className="font-medium">
          Adresses MAC inconnues ({unknown.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          {unknown.length > 0
            ? "LibreNMS les voit sur le réseau, mais aucun équipement du site ne les porte."
            : "Toutes celles que LibreNMS voit sont portées par un équipement ou ignorées."}
        </p>
      </div>
      {unknown.length > 0 ? (
        <ul className="divide-y">
          {shown.map((sighting) => (
            <li
              key={sighting.mac}
              className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0 space-y-0.5 text-sm">
                <p className="font-mono">{sighting.mac}</p>
                <p className="truncate text-muted-foreground">
                  {[
                    sighting.socket
                      ? `Prise « ${sighting.socket.name} »`
                      : "Sans prise",
                    [sighting.switchName, sighting.portName]
                      .filter(Boolean)
                      .join(" "),
                    `vue le ${when(sighting.seenAt)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void ignore(sighting.mac)}
                >
                  Ignorer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreating(sighting)}
                >
                  Créer l'équipement
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {unknown.length > SHOWN ? (
        <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
          {all
            ? "Afficher moins"
            : `Afficher les ${unknown.length - SHOWN} autres`}
        </Button>
      ) : null}
      {ignored.length > 0 ? (
        <div className="space-y-2 border-t pt-3">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={showIgnored}
            onClick={() => setShowIgnored(!showIgnored)}
          >
            <HugeiconsIcon
              icon={showIgnored ? ArrowDown01Icon : ArrowRight01Icon}
              strokeWidth={2}
            />
            Adresses ignorées ({ignored.length})
          </Button>
          {showIgnored ? (
            <ul className="divide-y">
              {ignored.map((row) => (
                <li
                  key={row.mac}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-mono">{row.mac}</p>
                    <p className="truncate text-muted-foreground">
                      Ignorée par {row.ignoredByName} le {when(row.ignoredAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void restore(row.mac)}
                  >
                    Rétablir
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <Dialog
        open={creating !== null}
        onOpenChange={(open) => {
          if (!open) setCreating(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Créer l'équipement</DialogTitle>
            <DialogDescription>
              {creating?.socket?.placed
                ? `Un équipement générique portant ${creating.mac}, placé près de la prise « ${creating.socket.name} ».`
                : `Un équipement générique portant ${creating?.mac ?? ""}, hors plan.`}
            </DialogDescription>
          </DialogHeader>
          {/* Keyed by MAC, so each one starts from its own form. */}
          {creating ? (
            <CreateForm
              key={creating.mac}
              siteId={siteId}
              sighting={creating}
              onDone={() => setCreating(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function CreateForm({
  siteId,
  sighting,
  onDone,
}: {
  siteId: string;
  sighting: UnknownMac;
  onDone: () => void;
}) {
  const createDevice = useMutation(api.unknownMacs.createDevice);
  const id = useId();
  // One id per form, so a retry after a lost answer finds the device made.
  const [deviceId] = useState(() => createStandaloneObjectId("device"));
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { placed } = await createDevice({
        siteId,
        mac: sighting.mac,
        deviceId,
        name,
      });
      toast.success(
        placed && sighting.socket
          ? `« ${name.trim()} » créé près de la prise « ${sighting.socket.name} »`
          : `« ${name.trim()} » créé, hors plan`,
      );
      onDone();
    } catch (caught) {
      setError(failureMessage(caught, "editor"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-6">
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={IDENTITY_TEXT_LIMITS.name}
          required
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          Créer
        </Button>
      </DialogFooter>
    </form>
  );
}
