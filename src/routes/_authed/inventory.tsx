import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  MoreHorizontalIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ModeToggle } from "@/components/mode-toggle";
import { ListSkeleton } from "@/components/loading-skeletons";
import { AppNavLinks, UserMenu } from "@/components/app-nav";
import { NetplanLogo } from "@/components/netplan-logo";
import { StatusDot } from "@/components/StatusDot";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollectionFreshness } from "@/sites/CollectionFreshness";
import { coverageByType } from "@/devices/coverage";
import type { TypeCoverage } from "@/devices/coverage";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { DEVICE_STATUS_LABELS, hasStatus } from "@/devices/status";
import { failureMessage } from "@/lib/errors";
import { useCanEdit } from "@/hooks/use-current-user";
import { asBuildingId, asDeviceId, asFloorId } from "@/lib/objectIds";
import { cn } from "@/lib/utils";
import { DeviceIdentityDialog } from "@/panels/drawer/DeviceIdentityDialog";
import { PortTableDialog } from "@/panels/drawer/PortTableDialog";
import { DeviceSheet } from "@/panels/DeviceSheet";
import {
  DeviceHistoryDialog,
  HAS_HISTORY,
} from "@/history/DeviceHistoryDialog";
import { matchesDeviceSearch } from "@/devices/search";
import { ImportReviews } from "@/sites/ImportReviews";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import { SiteSwitcher } from "@/sites/SiteSwitcher";
import { UnknownMacs } from "@/sites/UnknownMacs";
import { CreateDeviceDialog } from "@/devices/CreateDeviceDialog";
import { siteSearch, useCurrentSite } from "@/sites/useCurrentSite";
import type { SiteSummary } from "@/sites/useCurrentSite";
import { useMapStore } from "@/store/useMapStore";
import type { DeviceStatus, DeviceType } from "@/types/map";
import { api } from "../../../convex/_generated/api";

type InventoryRow = FunctionReturnType<typeof api.devices.listForSite>[number];
type Placement = "all" | "placed" | "unplaced";
type StatusFilter = "all" | DeviceStatus;
type TypeFilter = "all" | DeviceType;

const isStatus = (value: unknown): value is DeviceStatus =>
  typeof value === "string" && Object.hasOwn(DEVICE_STATUS_LABELS, value);

const isPlacement = (value: unknown): value is Placement =>
  value === "all" || value === "placed" || value === "unplaced";

/**
 * `status` and `placement` open the list filtered: the map links its
 * « hors plan » count to the devices it does not show.
 */
const inventorySearch = (
  search: Record<string, unknown>,
): { site?: string; status?: DeviceStatus; placement?: Placement } => ({
  ...siteSearch(search),
  ...(isStatus(search.status) && { status: search.status }),
  ...(isPlacement(search.placement) && { placement: search.placement }),
});

export const Route = createFileRoute("/_authed/inventory")({
  ssr: false,
  validateSearch: inventorySearch,
  head: () => ({ meta: [{ title: "Inventaire" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { site } = useCurrentSite();
  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-sidebar px-4 py-2">
        <Link
          to="/"
          search={site ? { site: site.id } : {}}
          aria-label="Retour au plan"
        >
          <NetplanLogo size={30} />
        </Link>
        <AppNavLinks site={site?.id} />
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          <div className="w-40 sm:w-56">
            <SiteSwitcher />
          </div>
          <ModeToggle />
          <UserMenu />
        </div>
      </header>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-4 md:p-8">
          {site === undefined ? (
            <ListSkeleton />
          ) : site === null ? (
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

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "up", label: DEVICE_STATUS_LABELS.up },
  { value: "down", label: DEVICE_STATUS_LABELS.down },
  { value: "stale", label: DEVICE_STATUS_LABELS.stale },
  { value: "unknown", label: DEVICE_STATUS_LABELS.unknown },
];

// A passive device has no status (B13), so no status filter or count has it.
const statusOf = (device: InventoryRow): DeviceStatus | null =>
  hasStatus(device.type) ? (device.metadata.status ?? "unknown") : null;

const byName = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

function SiteInventory({ site }: { site: SiteSummary }) {
  const devices = useQuery(api.devices.listForSite, { siteId: site.id });
  const canEdit = useCanEdit();
  const search = Route.useSearch();
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<Placement>(
    search.placement ?? "all",
  );
  const [status, setStatus] = useState<StatusFilter>(search.status ?? "all");
  const [chosenType, setType] = useState<TypeFilter>("all");
  const [creating, setCreating] = useState(false);

  const sorted = devices
    ? [...devices].sort((a, b) => byName.compare(a.name, b.name))
    : [];
  const counts: Record<Placement, number> = {
    all: sorted.length,
    placed: sorted.filter((device) => device.location).length,
    unplaced: sorted.filter((device) => !device.location).length,
  };
  const statusCounts: Record<StatusFilter, number> = {
    all: sorted.length,
    up: sorted.filter((device) => statusOf(device) === "up").length,
    down: sorted.filter((device) => statusOf(device) === "down").length,
    stale: sorted.filter((device) => statusOf(device) === "stale").length,
    unknown: sorted.filter((device) => statusOf(device) === "unknown").length,
  };
  const coverage = coverageByType(sorted);
  // A type whose last device went away, here or in another tab, filters nothing.
  const type = coverage.some((entry) => entry.type === chosenType)
    ? chosenType
    : "all";
  const typeFilters = [
    { value: "all" as const, label: "Tous les types" },
    ...coverage.map((entry) => ({
      value: entry.type,
      label: getDeviceKindLabel(entry.type),
    })),
  ];
  const shown = sorted.filter(
    (device) =>
      (placement === "all" ||
        (placement === "placed") === Boolean(device.location)) &&
      (status === "all" || statusOf(device) === status) &&
      (type === "all" || device.type === type) &&
      matchesDeviceSearch(device, query),
  );

  // A coverage count shows what is left to draw, so no other filter may hide it.
  const showUnplaced = (next: TypeFilter) => {
    const active = type === next && placement === "unplaced";
    setQuery("");
    setStatus("all");
    setType(active ? "all" : next);
    setPlacement(active ? "all" : "unplaced");
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Inventaire</h1>
          <p className="text-sm text-muted-foreground">
            Les équipements de {site.name}, sur le plan ou non.
          </p>
          <CollectionFreshness
            siteId={site.id}
            className="mt-3 w-fit max-w-sm"
          />
        </div>
        {/* An empty inventory offers the same button in its message. */}
        {canEdit && sorted.length > 0 ? (
          <Button onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Nouvel équipement
          </Button>
        ) : null}
      </header>

      {canEdit ? <ImportReviews siteId={site.id} /> : null}
      {canEdit ? <UnknownMacs siteId={site.id} /> : null}

      {coverage.length > 0 ? (
        <PlanCoverage
          coverage={coverage}
          active={placement === "unplaced" ? type : null}
          canEdit={canEdit}
          onSelect={showUnplaced}
        />
      ) : null}

      {devices === undefined ? (
        <ListSkeleton />
      ) : sorted.length === 0 ? (
        <InventoryEmpty canEdit={canEdit} onCreate={() => setCreating(true)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-60 flex-1">
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
            <div
              role="group"
              aria-label="État"
              className="flex gap-1 rounded-lg border p-1"
            >
              {STATUS_FILTERS.map(({ value, label }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={status === value ? "secondary" : "ghost"}
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                >
                  {label}
                  <span className="text-muted-foreground tabular-nums">
                    {statusCounts[value]}
                  </span>
                </Button>
              ))}
            </div>
            <Select
              items={typeFilters}
              value={type}
              onValueChange={(value) => {
                if (value) setType(value);
              }}
            >
              <SelectTrigger aria-label="Type" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeFilters.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {shown.length === 0 ? (
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
                    <th className="px-4 py-2 font-medium">État</th>
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
        </>
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

/**
 * Per type, how many devices stand on the plan; each count opens the ones
 * still to draw (ADR 0026).
 */
function PlanCoverage({
  coverage,
  active,
  canEdit,
  onSelect,
}: {
  coverage: Array<TypeCoverage>;
  active: TypeFilter | null;
  canEdit: boolean;
  onSelect: (type: DeviceType) => void;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id={id} className="text-sm font-medium">
          Couverture du plan
        </h2>
        {canEdit ? (
          <p className="text-xs text-muted-foreground">
            Un équipement hors plan se place depuis la carte, avec « Placer ».
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {coverage.map(({ type, placed, total }) => {
          const missing = total - placed;
          return (
            <button
              key={type}
              type="button"
              disabled={missing === 0}
              aria-pressed={active === type}
              onClick={() => onSelect(type)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:bg-muted",
                active === type && "border-primary bg-muted",
              )}
            >
              <span className="flex grow items-baseline justify-between gap-2">
                <span className="font-medium">{getDeviceKindLabel(type)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {placed}/{total}
                </span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${(placed / total) * 100}%` }}
                />
              </span>
              <span
                className={cn(
                  "text-xs",
                  missing === 0 ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {missing === 0
                  ? "Tout est sur le plan"
                  : `${missing} hors plan`}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function InventoryEmpty({
  canEdit,
  onCreate,
}: {
  canEdit: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
      <h2 className="text-base font-semibold">Aucun équipement dans ce site</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {canEdit
          ? "Créez-en un ici, hors plan, ou dessinez-le directement sur la carte."
          : "Un éditeur peut en créer ici ou les dessiner sur la carte."}
      </p>
      {canEdit ? (
        <Button onClick={onCreate}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          Nouvel équipement
        </Button>
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
  const [showingCables, setShowingCables] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const [showingSheet, setShowingSheet] = useState(false);
  const hasHistory = canEdit && HAS_HISTORY.has(device.type);
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
          toast.error(failureMessage(error, "editor"));
        }
      };
      toast(`« ${device.name} » supprimé`, {
        action: { label: "Annuler", onClick: () => void restore() },
        // Long enough to notice the wrong row went.
        duration: 10_000,
      });
    } catch (error) {
      toast.error(failureMessage(error, "editor"));
    }
  };

  return (
    <tr
      className="cursor-pointer align-top"
      // The whole row opens the device's sheet (A96); its own buttons and
      // links keep their action, and so do the dialogs it portals, whose
      // clicks reach the row through React.
      onClick={(event) => {
        const target = event.target;
        if (
          !(target instanceof Element) ||
          !event.currentTarget.contains(target) ||
          target.closest("button, a")
        ) {
          return;
        }
        setShowingSheet(true);
      }}
    >
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-sm text-left font-medium outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setShowingSheet(true)}
          >
            {device.name}
          </button>
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
      <td className="px-4 py-2.5 whitespace-nowrap">
        <DeviceStatusCell status={statusOf(device)} />
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
            <DropdownMenuItem onClick={() => setShowingCables(true)}>
              Câbles
            </DropdownMenuItem>
            {hasHistory ? (
              <DropdownMenuItem onClick={() => setShowingHistory(true)}>
                Historique
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
        <DeviceSheet
          device={showingSheet ? device : null}
          onOpenChange={setShowingSheet}
          onShowCables={() => setShowingCables(true)}
          onShowHistory={hasHistory ? () => setShowingHistory(true) : undefined}
          onShowOnMap={location ? showOnMap : undefined}
        />
        <PortTableDialog
          device={device}
          editable={canEdit}
          open={showingCables}
          onOpenChange={setShowingCables}
        />
        {hasHistory ? (
          <DeviceHistoryDialog
            device={device}
            open={showingHistory}
            onOpenChange={setShowingHistory}
          />
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

function DeviceStatusCell({ status }: { status: DeviceStatus | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "flex items-center gap-2",
        status === "down"
          ? "text-down"
          : (status === "unknown" || status === "stale") &&
              "text-muted-foreground",
      )}
    >
      <StatusDot status={status} decorative />
      {DEVICE_STATUS_LABELS[status]}
    </span>
  );
}
