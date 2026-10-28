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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  IDENTITY_TEXT_LIMITS,
  identityEditProblem,
  isSourceOwned,
  namedAfterHostname,
  normalizeIdentityEdit,
} from "@/devices/identity";
import type { IdentityEdit, IdentityField } from "@/devices/identity";
import { parseMacList } from "@/devices/mac";
import { useIdentityProblem } from "@/devices/useIdentityProblem";
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
      {/* The fields scroll between a fixed title and fixed buttons. */}
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Identité de {device.name}</DialogTitle>
          <DialogDescription>
            {device.source
              ? `Les champs grisés viennent de ${INTEGRATION_LABELS[device.source.integration]} et se modifient là-bas.`
              : "Ce qui permet de reconnaître l'équipement sur le réseau."}
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
  const problem = useIdentityProblem((field) => `${id}-${field}`);
  const [saving, setSaving] = useState(false);

  const owned = (field: IdentityField) => isSourceOwned(device.source, field);
  const sourceLabel = device.source
    ? INTEGRATION_LABELS[device.source.integration]
    : null;

  // A device with a hostname is named after it (B10, ADR 0029).
  const followsHostname = !owned("name") && text.hostname.trim() !== "";

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
        problem.refuse(
          "macs",
          `« ${parsed.unreadable} » n'est pas une adresse MAC.`,
        );
        return;
      }
      edit.macs = parsed.macs;
    }

    if (Object.keys(edit).length === 0) {
      onDone();
      return;
    }

    const normalized = namedAfterHostname(normalizeIdentityEdit(edit), device);
    const invalid = identityEditProblem(normalized);
    if (invalid) {
      problem.refuse(invalid.field, invalid.message);
      return;
    }

    setSaving(true);
    problem.clear();
    try {
      await updateIdentity({ deviceId: device.id, edit: normalized });
      onDone();
    } catch (caught) {
      problem.refuse(null, failureMessage(caught, "editor"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-col gap-4">
      <FieldGroup className="-mx-1 min-h-0 gap-4 overflow-y-auto px-1 pb-1">
        {TEXT_FIELDS.map(({ field, label, mono }) => (
          <Field key={field} data-invalid={problem.isInvalid(field)}>
            <FieldLabel htmlFor={`${id}-${field}`}>{label}</FieldLabel>
            <Input
              id={`${id}-${field}`}
              value={
                field === "name" && followsHostname
                  ? text.hostname.trim()
                  : text[field]
              }
              readOnly={field === "name" && followsHostname}
              disabled={owned(field)}
              maxLength={IDENTITY_TEXT_LIMITS[field]}
              required={field === "name"}
              autoFocus={field === "name" && !owned(field)}
              className={mono ? "font-mono" : undefined}
              {...problem.invalid(field)}
              onChange={(event) =>
                setText((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))
              }
            />
            {problem.errorUnder(field) ??
              (owned(field) ? (
                <FieldDescription>Géré par {sourceLabel}.</FieldDescription>
              ) : field === "name" && followsHostname ? (
                <FieldDescription>Le nom suit le hostname.</FieldDescription>
              ) : null)}
          </Field>
        ))}
        <Field data-invalid={problem.isInvalid("macs")}>
          <FieldLabel htmlFor={`${id}-macs`}>Adresses MAC</FieldLabel>
          <Textarea
            id={`${id}-macs`}
            value={macs}
            disabled={owned("macs")}
            rows={3}
            className="font-mono"
            {...problem.invalid("macs")}
            onChange={(event) => setMacs(event.target.value)}
          />
          {problem.errorUnder("macs") ?? (
            <FieldDescription>
              {owned("macs")
                ? `Géré par ${sourceLabel}.`
                : "Une par ligne, dans n'importe quelle notation."}
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={problem.isInvalid("notes")}>
          <FieldLabel htmlFor={`${id}-notes`}>Notes</FieldLabel>
          <Textarea
            id={`${id}-notes`}
            value={notes}
            maxLength={IDENTITY_TEXT_LIMITS.notes}
            rows={3}
            {...problem.invalid("notes")}
            onChange={(event) => setNotes(event.target.value)}
          />
          {problem.errorUnder("notes")}
        </Field>
      </FieldGroup>
      {problem.formError}
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
