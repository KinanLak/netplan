import { useMutation } from "convex/react";
import { Fragment, useId, useState } from "react";
import type { FormEvent } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deviceKinds } from "@/devices/deviceKindRegistry";
import {
  IDENTITY_TEXT_LIMITS,
  identityEditError,
  namedAfterHostname,
  normalizeIdentityEdit,
} from "@/devices/identity";
import { parseMacList } from "@/devices/mac";
import { failureMessage } from "@/lib/errors";
import { createStandaloneObjectId } from "@/lib/identity";
import type { SiteSummary } from "@/sites/useCurrentSite";
import type { DeviceType } from "@/types/map";
import { api } from "../../convex/_generated/api";

// A manual device joins the site's inventory, off the plan. The inventory
// and the map's « Placer » panel both create devices with this dialog.

const typeItems = deviceKinds.map((kind) => ({
  value: kind.type,
  label: kind.drawerLabel,
}));

type TextField = "name" | "hostname" | "ip" | "model" | "serial";

const TEXT_FIELDS: Array<{ field: TextField; label: string; mono?: boolean }> =
  [
    { field: "name", label: "Nom" },
    { field: "hostname", label: "Hostname", mono: true },
    { field: "ip", label: "Adresse IP", mono: true },
    { field: "model", label: "Modèle" },
    { field: "serial", label: "N° de série", mono: true },
  ];

export function CreateDeviceDialog({
  site,
  open,
  onOpenChange,
  onCreated,
}: {
  site: SiteSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new device's id once the server has it. */
  onCreated?: (deviceId: string, name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The fields scroll between a fixed title and fixed buttons. */}
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvel équipement</DialogTitle>
          <DialogDescription>
            Il rejoint l'inventaire du site, hors plan.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted on open, so each new device starts from an empty form. */}
        {open ? (
          <CreateDeviceForm
            site={site}
            onCreated={onCreated}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_TEXT: Record<TextField, string> = {
  name: "",
  hostname: "",
  ip: "",
  model: "",
  serial: "",
};

function CreateDeviceForm({
  site,
  onCreated,
  onDone,
}: {
  site: SiteSummary;
  onCreated?: (deviceId: string, name: string) => void;
  onDone: () => void;
}) {
  const createDevice = useMutation(api.devices.create);
  const id = useId();
  // One id per form, so a retry after a lost answer finds the device made.
  const [deviceId] = useState(() => createStandaloneObjectId("device"));
  const [type, setType] = useState<DeviceType>("endpoint");
  const [text, setText] = useState(EMPTY_TEXT);
  const [macs, setMacs] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A device with a hostname is named after it (B10, ADR 0029).
  const followsHostname = text.hostname.trim() !== "";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseMacList(macs);
    if ("unreadable" in parsed) {
      setError(`« ${parsed.unreadable} » n'est pas une adresse MAC.`);
      return;
    }
    const identity = namedAfterHostname(
      normalizeIdentityEdit({ ...text, macs: parsed.macs, notes }),
      {},
    );
    const invalid = identityEditError(identity);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createDevice({ siteId: site.id, deviceId, type, identity });
      onCreated?.(deviceId, identity.name ?? "");
      onDone();
    } catch (caught) {
      setError(failureMessage(caught, "editor"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex min-h-0 flex-col gap-4"
    >
      <FieldGroup className="-mx-1 min-h-0 gap-4 overflow-y-auto px-1 pb-1">
        {TEXT_FIELDS.map(({ field, label, mono }) => (
          <Fragment key={field}>
            <Field>
              <FieldLabel htmlFor={`${id}-${field}`}>{label}</FieldLabel>
              <Input
                id={`${id}-${field}`}
                value={
                  field === "name" && followsHostname
                    ? text.hostname.trim()
                    : text[field]
                }
                readOnly={field === "name" && followsHostname}
                maxLength={IDENTITY_TEXT_LIMITS[field]}
                required={field === "name"}
                // The one required field comes first and takes the focus.
                autoFocus={field === "name"}
                className={mono ? "font-mono" : undefined}
                onChange={(event) =>
                  setText((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
              />
              {field === "name" && followsHostname ? (
                <FieldDescription>Le nom suit le hostname.</FieldDescription>
              ) : null}
            </Field>
            {field === "name" ? (
              <Field>
                <FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel>
                <Select
                  items={typeItems}
                  value={type}
                  onValueChange={(value) => {
                    if (value) setType(value);
                  }}
                >
                  <SelectTrigger id={`${id}-type`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </Fragment>
        ))}
        <Field>
          <FieldLabel htmlFor={`${id}-macs`}>Adresses MAC</FieldLabel>
          <Textarea
            id={`${id}-macs`}
            value={macs}
            rows={3}
            className="font-mono"
            onChange={(event) => setMacs(event.target.value)}
          />
          <FieldDescription>
            Une par ligne, dans n'importe quelle notation.
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
          Créer
        </Button>
      </DialogFooter>
    </form>
  );
}
