import { HugeiconsIcon } from "@hugeicons/react";
import { useCanEdit } from "@/hooks/use-current-user";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  LayoutTable01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { StatusDot } from "@/components/StatusDot";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { DEVICE_STATUS_LABELS } from "@/devices/status";
import {
  DeviceHistoryDialog,
  HAS_HISTORY,
} from "@/history/DeviceHistoryDialog";
import { OPTIONAL_COLUMNS, locationLabel, statusOf } from "@/inventory/columns";
import type {
  ColumnId,
  InventoryRow,
  Sort,
  SortKey,
} from "@/inventory/columns";
import { failureMessage } from "@/lib/errors";
import { asBuildingId, asDeviceId, asFloorId } from "@/lib/objectIds";
import { cn } from "@/lib/utils";
import { DeviceIdentityDialog } from "@/panels/drawer/DeviceIdentityDialog";
import { PortTableDialog } from "@/panels/drawer/PortTableDialog";
import { DeviceSheet } from "@/panels/DeviceSheet";
import type { SiteSummary } from "@/sites/useCurrentSite";
import { useMapStore } from "@/store/useMapStore";
import { api } from "../../convex/_generated/api";

const SORTABLE: ReadonlySet<string> = new Set<SortKey>([
  "type",
  "status",
  "location",
]);

// Wide enough for every column to read; narrower windows scroll the table,
// never the page.
const NAME_MIN_REM = 14;
const ACTIONS_REM = 3;

/** The "Colonnes" menu: which optional columns show. */
export function ColumnPicker({
  hidden,
  onChange,
}: {
  hidden: ReadonlyArray<ColumnId>;
  onChange: (hidden: Array<ColumnId>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={buttonVariants({ variant: "outline", size: "default" })}
      >
        <HugeiconsIcon icon={LayoutTable01Icon} strokeWidth={1.5} />
        Colonnes
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
          {OPTIONAL_COLUMNS.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={!hidden.includes(column.id)}
              closeOnClick={false}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? hidden.filter((id) => id !== column.id)
                    : [...hidden, column.id],
                )
              }
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The devices, in their own scroll box: the header stays in view while the
 * rows scroll, and a narrow window scrolls the table sideways.
 */
export function InventoryTable({
  rows,
  site,
  canEdit,
  hidden,
  sort,
  onSort,
}: {
  rows: ReadonlyArray<InventoryRow>;
  site: SiteSummary;
  canEdit: boolean;
  hidden: ReadonlyArray<ColumnId>;
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  const columns = OPTIONAL_COLUMNS.filter(
    (column) => !hidden.includes(column.id),
  );
  const minWidth =
    NAME_MIN_REM +
    ACTIONS_REM +
    columns.reduce((sum, column) => sum + Number.parseFloat(column.width), 0);
  const shows = (id: ColumnId) => columns.some((column) => column.id === id);

  return (
    <div
      data-scroll-restoration-id="inventory-table"
      className="max-h-[calc(100svh-8rem)] overflow-auto rounded-lg border"
    >
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-sm"
        style={{ minWidth: `${minWidth}rem` }}
      >
        <colgroup>
          <col />
          {columns.map((column) => (
            <col key={column.id} style={{ width: column.width }} />
          ))}
          <col style={{ width: `${ACTIONS_REM}rem` }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-muted text-left text-xs text-muted-foreground">
          <tr className="*:border-b *:font-medium">
            <SortHeader sortKey="name" sort={sort} onSort={onSort}>
              Nom
            </SortHeader>
            {columns.map((column) =>
              SORTABLE.has(column.id) ? (
                <SortHeader
                  key={column.id}
                  sortKey={column.id as SortKey}
                  sort={sort}
                  onSort={onSort}
                >
                  {column.label}
                </SortHeader>
              ) : (
                <th key={column.id} className="px-4 py-2">
                  {column.label}
                </th>
              ),
            )}
            <th className="px-2 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="[&>tr:not(:last-child)>td]:border-b">
          {rows.map((device) => (
            <InventoryItem
              key={device.id}
              device={device}
              site={site}
              canEdit={canEdit}
              shows={shows}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  sortKey,
  sort,
  onSort,
  children,
}: {
  sortKey: SortKey;
  sort: Sort;
  onSort: (sort: Sort) => void;
  children: ReactNode;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      aria-sort={
        active ? (sort.descending ? "descending" : "ascending") : undefined
      }
      className="p-1"
    >
      <button
        type="button"
        onClick={() =>
          onSort({ key: sortKey, descending: active && !sort.descending })
        }
        className={cn(
          "flex w-full items-center gap-1 rounded-md px-3 py-1 text-left outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring",
          active && "text-foreground",
        )}
      >
        {children}
        {active ? (
          <HugeiconsIcon
            icon={sort.descending ? ArrowDown01Icon : ArrowUp01Icon}
            size={14}
            strokeWidth={2}
          />
        ) : null}
      </button>
    </th>
  );
}

const CELL = "px-4 py-2.5";

function InventoryItem({
  device,
  site,
  canEdit,
  shows,
}: {
  device: InventoryRow;
  site: SiteSummary;
  canEdit: boolean;
  shows: (id: ColumnId) => boolean;
}) {
  const navigate = useNavigate();
  const createDevice = useMutation(api.devices.create);
  const removeDevice = useMutation(api.devices.remove);
  const [editing, setEditing] = useState(false);
  const [showingCables, setShowingCables] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const [showingSheet, setShowingSheet] = useState(false);
  // History is read by role, archived site or not (ADR 0033).
  const canReadHistory = useCanEdit();
  const hasHistory = canReadHistory && HAS_HISTORY.has(device.type);
  const { location, source } = device;
  const removable = canEdit && !location && !source;
  const status = statusOf(device);
  const place = locationLabel(device);

  const showOnMap = () => {
    if (!location) return;
    const { setCurrentBuilding, setCurrentFloor, selectDevice } =
      useMapStore.getState();
    setCurrentBuilding(asBuildingId(location.buildingId));
    setCurrentFloor(asFloorId(location.floorId));
    selectDevice(asDeviceId(device.id));
    void navigate({
      to: "/",
      search: { site: site.id, floor: location.floorId, device: device.id },
    });
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
      className="cursor-pointer align-baseline transition-colors hover:bg-muted"
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
      <td className={CELL}>
        <div className="flex min-w-0 items-baseline gap-2">
          <button
            type="button"
            className="truncate rounded-sm text-left font-medium outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            title={device.name}
            onClick={() => setShowingSheet(true)}
          >
            {device.name}
          </button>
          {/* Most devices come from an integration; only the others say so. */}
          {source ? null : (
            <Badge variant="outline" className="shrink-0">
              Manuel
            </Badge>
          )}
        </div>
        {device.hostname ? (
          <div
            className="truncate font-mono text-xs text-muted-foreground"
            title={device.hostname}
          >
            {device.hostname}
          </div>
        ) : null}
      </td>
      {shows("type") ? (
        <td className={cn(CELL, "truncate text-muted-foreground")}>
          {getDeviceKindLabel(device.type)}
        </td>
      ) : null}
      {shows("status") ? (
        <td className={CELL}>
          {status === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span
              className={cn(
                "inline-flex items-baseline gap-2",
                status === "down"
                  ? "text-down"
                  : (status === "unknown" || status === "stale") &&
                      "text-muted-foreground",
              )}
            >
              <StatusDot status={status} decorative className="self-center" />
              {DEVICE_STATUS_LABELS[status]}
            </span>
          )}
        </td>
      ) : null}
      {shows("macs") ? (
        <td className={cn(CELL, "font-mono text-xs")}>
          {device.macs.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            device.macs.map((mac) => <div key={mac}>{mac}</div>)
          )}
        </td>
      ) : null}
      {shows("ip") ? (
        <td
          className={cn(CELL, "truncate font-mono text-xs")}
          title={device.ip}
        >
          {device.ip ?? <span className="text-muted-foreground">—</span>}
        </td>
      ) : null}
      {shows("location") ? (
        <td className={cn(CELL, "truncate")} title={place}>
          {place ?? <span className="text-muted-foreground">Hors plan</span>}
        </td>
      ) : null}
      <td className="px-2 py-1.5 align-middle">
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
