import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  EthernetPortIcon,
  Location01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useOnlineMutation } from "@/hooks/use-online-mutation";
import type { FunctionReturnType } from "convex/server";
import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";
import { Time } from "@/components/time";
import { CopyValue } from "@/components/copy-value";
import { IconNote, IconNotes } from "@/components/icon-note";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
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
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { SocketName } from "@/devices/SocketName";
import { IDENTITY_TEXT_LIMITS } from "@/devices/identity";
import { matchesDeviceSearch } from "@/devices/search";
import { showOnMap } from "@/inventory/showOnMap";
import { failureMessage } from "@/lib/errors";
import { createStandaloneObjectId } from "@/lib/identity";
import { api } from "../../convex/_generated/api";

type UnknownMac = FunctionReturnType<
  typeof api.unknownMacs.listForSite
>[number];
type IgnoredMac = FunctionReturnType<
  typeof api.unknownMacs.listIgnored
>[number];

/** The MAC in any notation, or where it was seen, every word required. */
const matches = (
  mac: string,
  place: ReadonlyArray<string | null | undefined>,
  query: string,
) =>
  matchesDeviceSearch(
    { name: "", macs: [mac] },
    query,
    place.map((part) => part ?? undefined),
  );

/** What one request may ignore or restore: `MAX_MACS` on the server. */
const MAX_BATCH = 500;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count > 1 ? many : one}`;

/**
 * MAC addresses the network sees that no device of the site carries, for an
 * Éditeur to turn into equipment (ADR 0022) or ignore (ADR 0026), one by one
 * or by selection.
 */
export function UnknownMacs({
  siteId,
  query,
  onQueryChange,
  showIgnored,
  onShowIgnoredChange,
}: {
  siteId: string;
  /** The search and the ignored list's state live in the URL (A62). */
  query: string;
  onQueryChange: (query: string) => void;
  showIgnored: boolean;
  onShowIgnoredChange: (shown: boolean) => void;
}) {
  const unknown = useQuery(api.unknownMacs.listForSite, { siteId });
  const ignored = useQuery(api.unknownMacs.listIgnored, { siteId });
  const ignoreMacs = useOnlineMutation(api.unknownMacs.ignore);
  const restoreMacs = useOnlineMutation(api.unknownMacs.restore);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [chosenIgnored, setChosenIgnored] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [creating, setCreating] = useState<UnknownMac | null>(null);
  if (!unknown || !ignored) return null;

  const shown = unknown.filter((row) =>
    matches(row.mac, [row.socket?.name, row.switchName, row.portName], query),
  );
  const shownIgnored = ignored.filter((row) =>
    matches(
      row.mac,
      [
        row.lastSeen?.socketName,
        row.lastSeen?.switchName,
        row.lastSeen?.portName,
      ],
      query,
    ),
  );
  // A selection never holds a row the list no longer shows.
  const picked = shown.filter((row) => selected.has(row.mac));
  const pickedIgnored = shownIgnored.filter((row) =>
    chosenIgnored.has(row.mac),
  );

  const restore = async (macs: Array<string>, announce: boolean) => {
    try {
      await restoreMacs({ siteId, macs });
      setChosenIgnored(new Set());
      if (announce) {
        toast(
          macs.length === 1
            ? `${macs[0]} rétablie`
            : `${plural(macs.length, "adresse rétablie", "adresses rétablies")}`,
          {
            action: {
              label: "Annuler",
              onClick: () => void ignore(macs, false),
            },
            duration: 10_000,
          },
        );
      }
    } catch (error) {
      toast.error(failureMessage(error, "editor"));
    }
  };
  const ignore = async (macs: Array<string>, announce: boolean) => {
    try {
      await ignoreMacs({ siteId, macs });
      setSelected(new Set());
      if (announce) {
        toast(
          macs.length === 1
            ? `${macs[0]} ignorée`
            : `${plural(macs.length, "adresse ignorée", "adresses ignorées")}`,
          {
            action: {
              label: "Annuler",
              onClick: () => void restore(macs, false),
            },
            duration: 10_000,
          },
        );
      }
    } catch (error) {
      toast.error(failureMessage(error, "editor"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <HugeiconsIcon
          icon={Search01Icon}
          size={16}
          strokeWidth={1.5}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="MAC, prise, switch, port…"
          aria-label="Rechercher une adresse MAC"
          className="pl-8"
        />
      </div>

      {unknown.length === 0 ? null : (
        <section aria-label="Adresses MAC inconnues" className="space-y-2">
          <SelectionBar
            count={shown.length}
            total={unknown.length}
            picked={picked.length}
            noun={["adresse inconnue", "adresses inconnues"]}
            onClear={() => setSelected(new Set())}
          >
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void ignore(
                  picked.map((row) => row.mac),
                  true,
                )
              }
            >
              Ignorer la sélection
            </Button>
          </SelectionBar>
          {shown.length === 0 ? (
            <NoMatch onReset={() => onQueryChange("")} />
          ) : (
            <MacTable
              rows={shown}
              picked={picked.length}
              isPicked={(mac) => selected.has(mac)}
              onPickAll={(all) =>
                setSelected(
                  new Set(
                    all ? shown.slice(0, MAX_BATCH).map((row) => row.mac) : [],
                  ),
                )
              }
              onPick={(mac, on) => setSelected(toggled(selected, mac, on))}
              where={(row) => (
                <Where
                  socketName={row.socket?.name ?? null}
                  switchName={row.switchName}
                  portName={row.portName}
                />
              )}
              when={(row) => <Time at={row.seenAt} />}
              actions={(row) => (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void ignore([row.mac], true)}
                  >
                    Ignorer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCreating(row)}
                  >
                    Créer l'équipement
                  </Button>
                </>
              )}
              whenLabel="Vue le"
            />
          )}
        </section>
      )}

      {ignored.length > 0 ? (
        <section aria-label="Adresses ignorées" className="space-y-2 pt-2">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={showIgnored}
            onClick={() => onShowIgnoredChange(!showIgnored)}
            className="-ml-2"
          >
            <HugeiconsIcon
              icon={showIgnored ? ArrowDown01Icon : ArrowRight01Icon}
              strokeWidth={2}
            />
            Adresses ignorées
            <span className="text-muted-foreground tabular-nums">
              {ignored.length}
            </span>
          </Button>
          {showIgnored ? (
            <>
              <SelectionBar
                count={shownIgnored.length}
                total={ignored.length}
                picked={pickedIgnored.length}
                noun={["adresse ignorée", "adresses ignorées"]}
                onClear={() => setChosenIgnored(new Set())}
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void restore(
                      pickedIgnored.map((row) => row.mac),
                      true,
                    )
                  }
                >
                  Rétablir la sélection
                </Button>
              </SelectionBar>
              {shownIgnored.length === 0 ? (
                <NoMatch onReset={() => onQueryChange("")} />
              ) : (
                <MacTable
                  rows={shownIgnored}
                  picked={pickedIgnored.length}
                  isPicked={(mac) => chosenIgnored.has(mac)}
                  onPickAll={(all) =>
                    setChosenIgnored(
                      new Set(
                        all
                          ? shownIgnored
                              .slice(0, MAX_BATCH)
                              .map((row) => row.mac)
                          : [],
                      ),
                    )
                  }
                  onPick={(mac, on) =>
                    setChosenIgnored(toggled(chosenIgnored, mac, on))
                  }
                  where={(row: IgnoredMac) =>
                    row.lastSeen ? (
                      <Where {...row.lastSeen} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  }
                  when={(row: IgnoredMac) => (
                    <span className="text-muted-foreground">
                      par {row.ignoredByName} le <Time at={row.ignoredAt} />
                    </span>
                  )}
                  whenLabel="Ignorée"
                  actions={(row: IgnoredMac) => (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void restore([row.mac], true)}
                    >
                      Rétablir
                    </Button>
                  )}
                />
              )}
            </>
          ) : null}
        </section>
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
          </DialogHeader>
          {creating ? (
            <IconNotes>
              <IconNote icon={EthernetPortIcon}>
                <span className="font-mono">{creating.mac}</span>
              </IconNote>
              <IconNote icon={Location01Icon}>
                {creating.socket?.placed
                  ? `Près de « ${creating.socket.name} »`
                  : "Hors plan"}
              </IconNote>
            </IconNotes>
          ) : null}
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
    </div>
  );
}

const toggled = (set: ReadonlySet<string>, mac: string, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(mac);
  else next.delete(mac);
  return next;
};

/** How many rows show, or how many are picked and what to do with them. */
function SelectionBar({
  count,
  total,
  picked,
  noun,
  onClear,
  children,
}: {
  count: number;
  total: number;
  picked: number;
  noun: [string, string];
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
      {picked > 0 ? (
        <>
          <span
            className={picked > MAX_BATCH ? "text-down" : "text-foreground"}
          >
            {plural(picked, "sélectionnée", "sélectionnées")}
            {picked >= MAX_BATCH ? ` (${MAX_BATCH} au plus à la fois)` : null}
          </span>
          {picked > MAX_BATCH ? null : children}
          <Button size="sm" variant="ghost" onClick={onClear}>
            Désélectionner
          </Button>
        </>
      ) : (
        <span aria-live="polite">
          {count === total
            ? plural(total, ...noun)
            : `${count} sur ${plural(total, ...noun)}`}
        </span>
      )}
    </div>
  );
}

function NoMatch({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex justify-center rounded-lg border border-dashed p-6">
      <Button variant="outline" size="sm" onClick={onReset}>
        Effacer la recherche
      </Button>
    </div>
  );
}

function Where({
  socketName,
  switchName,
  portName,
}: {
  socketName: string | null;
  switchName: string | null;
  portName: string | null;
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">
        {socketName === null ? "Sans prise" : <SocketName name={socketName} />}
      </span>
      {switchName || portName ? (
        <span className="flex gap-2 truncate font-mono text-xs text-muted-foreground">
          {switchName ? <span className="truncate">{switchName}</span> : null}
          {portName ? <span className="shrink-0">{portName}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

function MacTable<Row extends { mac: string }>({
  rows,
  picked,
  isPicked,
  onPickAll,
  onPick,
  where,
  when,
  whenLabel,
  actions,
}: {
  rows: ReadonlyArray<Row>;
  picked: number;
  isPicked: (mac: string) => boolean;
  onPickAll: (all: boolean) => void;
  onPick: (mac: string, on: boolean) => void;
  where: (row: Row) => ReactNode;
  when: (row: Row) => ReactNode;
  whenLabel: string;
  actions: (row: Row) => ReactNode;
}) {
  const all = picked > 0 && picked === rows.length;
  return (
    <div className="max-h-[calc(100svh-12rem)] overflow-auto rounded-lg border">
      <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
          <tr className="*:border-b *:px-4 *:py-2 *:font-medium">
            <th className="w-10">
              <Checkbox
                checked={all}
                indeterminate={picked > 0 && !all}
                onCheckedChange={(checked) => onPickAll(checked)}
                aria-label="Tout sélectionner"
              />
            </th>
            <th>Adresse MAC</th>
            <th>Vue sur</th>
            <th>{whenLabel}</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="[&>tr:not(:last-child)>td]:border-b">
          {rows.map((row) => (
            <tr key={row.mac} className="align-middle hover:bg-muted">
              <td className="px-4 py-2">
                <Checkbox
                  checked={isPicked(row.mac)}
                  onCheckedChange={(checked) => onPick(row.mac, checked)}
                  aria-label={`Sélectionner ${row.mac}`}
                />
              </td>
              <td className="px-4 py-2 text-xs whitespace-nowrap">
                <CopyValue value={row.mac} label="l'adresse MAC" />
              </td>
              <td className="max-w-64 px-4 py-2">{where(row)}</td>
              <td className="px-4 py-2 whitespace-nowrap">{when(row)}</td>
              <td className="px-4 py-2">
                <div className="flex justify-end gap-2">{actions(row)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A workstation first, as most unknown MACs on edge ports are; an endpoint by
// default, as the server knows nothing more of it.
const TYPES = (["pc", "endpoint"] as const).map((type) => ({
  value: type,
  label: getDeviceKindLabel(type),
}));

function CreateForm({
  siteId,
  sighting,
  onDone,
}: {
  siteId: string;
  sighting: UnknownMac;
  onDone: () => void;
}) {
  const createDevice = useOnlineMutation(api.unknownMacs.createDevice);
  const navigate = useNavigate();
  const id = useId();
  // One id per form, so a retry after a lost answer finds the device made.
  const [deviceId] = useState(() => createStandaloneObjectId("device"));
  const [type, setType] = useState<"pc" | "endpoint">("endpoint");
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { location } = await createDevice({
        siteId,
        mac: sighting.mac,
        deviceId,
        type,
        name,
        ...(hostname.trim() && { hostname }),
      });
      toast.success(
        location && sighting.socket
          ? `« ${name.trim()} » créé près de « ${sighting.socket.name} »`
          : `« ${name.trim()} » créé, hors plan`,
        location
          ? {
              action: {
                label: "Voir sur le plan",
                onClick: () => showOnMap(navigate, siteId, deviceId, location),
              },
              duration: 10_000,
            }
          : undefined,
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
      <div className="grid gap-4">
        <Field>
          <FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel>
          <Select
            items={TYPES}
            value={type}
            onValueChange={(value) => {
              if (value) setType(value);
            }}
          >
            <SelectTrigger id={`${id}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
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
        <Field>
          <FieldLabel htmlFor={`${id}-hostname`}>Hostname</FieldLabel>
          <Input
            id={`${id}-hostname`}
            value={hostname}
            maxLength={IDENTITY_TEXT_LIMITS.hostname}
            className="font-mono"
            onChange={(event) => setHostname(event.target.value)}
          />
          <FieldDescription>Facultatif.</FieldDescription>
        </Field>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          Créer l'équipement
        </Button>
      </DialogFooter>
    </form>
  );
}
