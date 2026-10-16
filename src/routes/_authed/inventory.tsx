import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowLeft01Icon,
  MoreHorizontalIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
import { ModeToggle } from "@/components/mode-toggle";
import { NetplanLogo } from "@/components/netplan-logo";
import { ThemeProvider } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Toaster } from "@/components/ui/sonner";
import { deviceKinds, getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import {
  IDENTITY_TEXT_LIMITS,
  identityEditError,
  normalizeIdentityEdit,
} from "@/devices/identity";
import { parseMacList } from "@/devices/mac";
import { deviceMutationError } from "@/devices/mutationError";
import { useCanEdit } from "@/hooks/use-current-user";
import { createStandaloneObjectId } from "@/lib/identity";
import { asBuildingId, asDeviceId, asFloorId } from "@/lib/objectIds";
import { cn } from "@/lib/utils";
import { DeviceIdentityDialog } from "@/panels/drawer/DeviceIdentityDialog";
import { matchesDeviceSearch } from "@/devices/search";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import { SiteSwitcher } from "@/sites/SiteSwitcher";
import { siteSearch, useCurrentSite } from "@/sites/useCurrentSite";
import type { SiteSummary } from "@/sites/useCurrentSite";
import { useMapStore } from "@/store/useMapStore";
import type { DeviceType } from "@/types/map";
import { api } from "../../../convex/_generated/api";

type InventoryRow = FunctionReturnType<typeof api.devices.listForSite>[number];
type Placement = "all" | "placed" | "unplaced";

export const Route = createFileRoute("/_authed/inventory")({
  ssr: false,
  validateSearch: siteSearch,
  head: () => ({ meta: [{ title: "Inventaire · Netplan" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="netplan-ui-theme">
      <InventoryContent />
      <Toaster />
    </ThemeProvider>
  );
}

function InventoryContent() {
  const { site } = useCurrentSite();
  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b bg-sidebar px-4 py-2">
        <Link
          to="/"
          search={site ? { site: site.id } : {}}
          aria-label="Retour à la carte"
        >
          <NetplanLogo size={30} />
        </Link>
        <Link
          to="/"
          search={site ? { site: site.id } : {}}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} />
          Carte
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-56">
            <SiteSwitcher />
          </div>
          <ModeToggle />
        </div>
      </header>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-4 md:p-8">
          {site === undefined ? null : site === null ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aucun site n'est encore configuré.
            </p>
          ) : (
            <SiteInventory key={site.id} site={site} />
          )}
        </div>
      </main>
    </div>
  );
}

const PLACEMENT_FILTERS: Array<{ value: Placement; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "placed", label: "Sur le plan" },
  { value: "unplaced", label: "Hors plan" },
];

const byName = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

function SiteInventory({ site }: { site: SiteSummary }) {
  const devices = useQuery(api.devices.listForSite, { siteId: site.id });
  const canEdit = useCanEdit();
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<Placement>("all");
  const [creating, setCreating] = useState(false);

  const sorted = devices
    ? [...devices].sort((a, b) => byName.compare(a.name, b.name))
    : [];
  const counts: Record<Placement, number> = {
    all: sorted.length,
    placed: sorted.filter((device) => device.location).length,
    unplaced: sorted.filter((device) => !device.location).length,
  };
  const shown = sorted.filter(
    (device) =>
      (placement === "all" ||
        (placement === "placed") === Boolean(device.location)) &&
      matchesDeviceSearch(device, query),
  );

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Inventaire</h1>
          <p className="text-sm text-muted-foreground">
            Les équipements de {site.name}, sur le plan ou non.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Nouvel équipement
          </Button>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            strokeWidth={1.5}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom, hostname, MAC, IP, n° de série…"
            aria-label="Rechercher un équipement"
            className="pl-8"
          />
        </div>
        <div
          role="group"
          aria-label="Emplacement"
          className="flex gap-1 rounded-lg border p-1"
        >
          {PLACEMENT_FILTERS.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              variant={placement === value ? "secondary" : "ghost"}
              aria-pressed={placement === value}
              onClick={() => setPlacement(value)}
            >
              {label}
              <span className="text-muted-foreground tabular-nums">
                {counts[value]}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {devices === undefined ? null : sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucun équipement dans ce site.
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucun équipement ne correspond.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Nom</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Adresses MAC</th>
                <th className="px-4 py-2 font-medium">Adresse IP</th>
                <th className="px-4 py-2 font-medium">Emplacement</th>
                <th className="w-10 px-2 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((device) => (
                <InventoryItem
                  key={device.id}
                  device={device}
                  site={site}
                  canEdit={canEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit ? (
        <CreateDeviceDialog
          site={site}
          open={creating}
          onOpenChange={setCreating}
        />
      ) : null}
    </div>
  );
}

function InventoryItem({
  device,
  site,
  canEdit,
}: {
  device: InventoryRow;
  site: SiteSummary;
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const createDevice = useMutation(api.devices.create);
  const removeDevice = useMutation(api.devices.remove);
  const [editing, setEditing] = useState(false);
  const { location, source } = device;
  const removable = canEdit && !location && !source;

  const showOnMap = () => {
    if (!location) return;
    const { setCurrentBuilding, setCurrentFloor, selectDevice } =
      useMapStore.getState();
    setCurrentBuilding(asBuildingId(location.buildingId));
    setCurrentFloor(asFloorId(location.floorId));
    selectDevice(asDeviceId(device.id));
    void navigate({ to: "/", search: { site: site.id } });
  };

  const remove = async () => {
    try {
      const removed = await removeDevice({ deviceId: device.id });
      if (!removed) return;
      // The same id and what the server removed bring it back as it was.
      const restore = async () => {
        try {
          await createDevice({
            siteId: site.id,
            deviceId: device.id,
            ...removed,
          });
        } catch (error) {
          toast.error(deviceMutationError(error));
        }
      };
      toast(`« ${device.name} » supprimé`, {
        action: { label: "Annuler", onClick: () => void restore() },
        // Long enough to notice the wrong row went.
        duration: 10_000,
      });
    } catch (error) {
      toast.error(deviceMutationError(error));
    }
  };

  return (
    <tr className="align-top">
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{device.name}</span>
          {source ? (
            <Badge variant="outline">
              {INTEGRATION_LABELS[source.integration]}
            </Badge>
          ) : null}
        </div>
        {device.hostname ? (
          <div className="font-mono text-xs text-muted-foreground">
            {device.hostname}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
        {getDeviceKindLabel(device.type)}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs">
        {device.macs.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          device.macs.map((mac) => <div key={mac}>{mac}</div>)
        )}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs">
        {device.ip ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        {location ? (
          `${location.buildingName} · ${location.floorName}`
        ) : (
          <span className="text-muted-foreground">Hors plan</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        {location || canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions pour ${device.name}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
              )}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {location ? (
                <DropdownMenuItem onClick={showOnMap}>
                  Voir sur le plan
                </DropdownMenuItem>
              ) : null}
              {canEdit ? (
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  Modifier l'identité
                </DropdownMenuItem>
              ) : null}
              {removable ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => void remove()}
                >
                  Supprimer
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {canEdit ? (
          <DeviceIdentityDialog
            device={{ ...device, id: asDeviceId(device.id) }}
            open={editing}
            onOpenChange={setEditing}
          />
        ) : null}
      </td>
    </tr>
  );
}

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

function CreateDeviceDialog({
  site,
  open,
  onOpenChange,
}: {
  site: SiteSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvel équipement</DialogTitle>
          <DialogDescription>
            Il rejoint l'inventaire de {site.name}, hors plan.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted on open, so each new device starts from an empty form. */}
        {open ? (
          <CreateDeviceForm site={site} onDone={() => onOpenChange(false)} />
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
  onDone,
}: {
  site: SiteSummary;
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseMacList(macs);
    if ("unreadable" in parsed) {
      setError(`« ${parsed.unreadable} » n'est pas une adresse MAC.`);
      return;
    }
    const identity = normalizeIdentityEdit({
      ...text,
      macs: parsed.macs,
      notes,
    });
    const invalid = identityEditError(identity);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createDevice({ siteId: site.id, deviceId, type, identity });
      onDone();
    } catch (caught) {
      setError(deviceMutationError(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-6">
      <FieldGroup className="gap-4">
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
              {typeItems.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {TEXT_FIELDS.map(({ field, label, mono }) => (
          <Field key={field}>
            <FieldLabel htmlFor={`${id}-${field}`}>{label}</FieldLabel>
            <Input
              id={`${id}-${field}`}
              value={text[field]}
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
          </Field>
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
