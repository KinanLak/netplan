import { useMutation } from "convex/react";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import type { Device } from "@/types/map";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  IDENTITY_TEXT_LIMITS,
  identityEditError,
  isSourceOwned,
  normalizeIdentityEdit,
} from "@/devices/identity";
import type { IdentityEdit, IdentityField } from "@/devices/identity";
import { parseMacList } from "@/devices/mac";
import { failureMessage } from "@/lib/errors";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import { api } from "../../../convex/_generated/api";

type TextField = "name" | "hostname" | "ip" | "model" | "serial";

const TEXT_FIELDS: Array<{ field: TextField; label: string; mono?: boolean }> =
  [
    { field: "name", label: "Nom" },
    { field: "hostname", label: "Hostname", mono: true },
    { field: "ip", label: "Adresse IP", mono: true },
    { field: "model", label: "Modèle" },
    { field: "serial", label: "N° de série", mono: true },
  ];

/** What the dialog reads and edits: the identity, wherever the device stands. */
export type IdentityDevice = Pick<
  Device,
  | "id"
  | "name"
  | "hostname"
  | "serial"
  | "macs"
  | "model"
  | "ip"
  | "notes"
  | "source"
>;

export function DeviceIdentityDialog({
  device,
  open,
  onOpenChange,
}: {
  device: IdentityDevice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Identité de {device.name}</DialogTitle>
          <DialogDescription>
            {device.source
              ? `Les champs grisés viennent de ${INTEGRATION_LABELS[device.source.integration]} et se modifient là-bas.`
              : "Ce qui permet de reconnaître l'appareil sur le réseau."}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted on open, so the form starts from the device as it is now. */}
        {open ? (
          <IdentityForm device={device} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function IdentityForm({
  device,
  onDone,
}: {
  device: IdentityDevice;
  onDone: () => void;
}) {
  const updateIdentity = useMutation(api.devices.updateIdentity);
  const id = useId();
  // The device as the form opened on it: only fields edited since are sent,
  // so a save never reverts what another user changed meanwhile.
  const [initial] = useState(() => ({
    text: {
      name: device.name,
      hostname: device.hostname ?? "",
      ip: device.ip ?? "",
      model: device.model ?? "",
      serial: device.serial ?? "",
    } satisfies Record<TextField, string>,
    macs: device.macs.join("\n"),
    notes: device.notes ?? "",
  }));
  const [text, setText] = useState(initial.text);
  const [macs, setMacs] = useState(initial.macs);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const owned = (field: IdentityField) => isSourceOwned(device.source, field);
  const sourceLabel = device.source
    ? INTEGRATION_LABELS[device.source.integration]
    : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const edit: IdentityEdit = {};
    for (const { field } of TEXT_FIELDS) {
      if (!owned(field) && text[field] !== initial.text[field]) {
        edit[field] = text[field];
      }
    }
    if (!owned("notes") && notes !== initial.notes) edit.notes = notes;
    if (!owned("macs") && macs !== initial.macs) {
      const parsed = parseMacList(macs);
      if ("unreadable" in parsed) {
        setError(`« ${parsed.unreadable} » n'est pas une adresse MAC.`);
        return;
      }
      edit.macs = parsed.macs;
    }

    if (Object.keys(edit).length === 0) {
      onDone();
      return;
    }

    const normalized = normalizeIdentityEdit(edit);
    const invalid = identityEditError(normalized);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateIdentity({ deviceId: device.id, edit: normalized });
      onDone();
    } catch (caught) {
      setError(failureMessage(caught, "editor"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      <FieldGroup className="gap-4">
        {TEXT_FIELDS.map(({ field, label, mono }) => (
          <Field key={field}>
            <FieldLabel htmlFor={`${id}-${field}`}>{label}</FieldLabel>
            <Input
              id={`${id}-${field}`}
              value={text[field]}
              disabled={owned(field)}
              maxLength={IDENTITY_TEXT_LIMITS[field]}
              required={field === "name"}
              className={mono ? "font-mono" : undefined}
              onChange={(event) =>
                setText((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))
              }
            />
            {owned(field) ? (
              <FieldDescription>Géré par {sourceLabel}.</FieldDescription>
            ) : null}
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor={`${id}-macs`}>Adresses MAC</FieldLabel>
          <Textarea
            id={`${id}-macs`}
            value={macs}
            disabled={owned("macs")}
            rows={3}
            className="font-mono"
            onChange={(event) => setMacs(event.target.value)}
          />
          <FieldDescription>
            {owned("macs")
              ? `Géré par ${sourceLabel}.`
              : "Une par ligne, dans n'importe quelle notation."}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
          <Textarea
            id={`${id}-notes`}
            value={notes}
            maxLength={IDENTITY_TEXT_LIMITS.notes}
            rows={3}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </FieldGroup>
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}
