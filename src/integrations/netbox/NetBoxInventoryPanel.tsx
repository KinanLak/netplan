import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { useReactFlow } from "@xyflow/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ComputerIcon,
  DatabaseIcon,
  HardDriveIcon,
  PlugSocketIcon,
  ServerStack03Icon,
} from "@hugeicons/core-free-icons";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getDeviceKind } from "@/devices/deviceKindRegistry";
import {
  matchesNetBoxInventoryFilters,
  netBoxEquipmentLabel,
  netBoxLifecycleLabel,
  netBoxLocationLabel,
} from "@/integrations/netbox/inventory";
import type { NetBoxTypeFilter } from "@/integrations/netbox/inventory";
import { layoutInventoryGrid } from "@/integrations/netbox/inventoryPlacement";
import { cn } from "@/lib/utils";
import { asSiteId } from "@/lib/objectIds";
import {
  useMapDocumentActions,
  useMapDocumentReady,
} from "@/map-session/useMapDocument";
import { useCurrentFloorId, useIsEditMode } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import type { DeviceDraft, DeviceId, DeviceType } from "@/types/map";
import { useCurrentSiteId } from "@/sites/useCurrentSite";

const typeFilters: Array<{ value: NetBoxTypeFilter; label: string }> = [
  { value: "all", label: "Tout" },
  { value: "pc", label: "Postes" },
  { value: "wall-port", label: "Prises" },
  { value: "switch", label: "Switches" },
  { value: "rack", label: "Racks" },
];

const typeIcons = {
  pc: ComputerIcon,
  "wall-port": PlugSocketIcon,
  switch: HardDriveIcon,
  rack: ServerStack03Icon,
} satisfies Record<DeviceType, typeof ComputerIcon>;

const syncDate = (timestamp: number | undefined): string =>
  timestamp
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(timestamp)
    : "Jamais";

export function NetBoxInventoryPanel() {
  "use no memo";

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<NetBoxTypeFilter>("all");
  const [location, setLocation] = useState("all");
  const [hidePlaced, setHidePlaced] = useState(true);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const listRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const siteId = useCurrentSiteId();
  const site = useQuery(api.sites.get, siteId ? { siteId } : "skip");

  const inventoryResult = useQuery(
    api.netbox.listInventory,
    open && siteId ? { siteId } : "skip",
  );
  const inventory = useMemo(() => inventoryResult ?? [], [inventoryResult]);
  const syncState = useQuery(
    api.netbox.getSyncState,
    siteId ? { siteId } : "skip",
  );
  const libreNmsState = useQuery(
    api.librenms.getSyncState,
    open && siteId ? { siteId } : "skip",
  );
  const discoveriesResult = useQuery(
    api.librenms.listDiscoveredConnections,
    open && siteId ? { siteId } : "skip",
  );
  const discoveries = useMemo(
    () => discoveriesResult ?? [],
    [discoveriesResult],
  );
  const isEditMode = useIsEditMode();
  const currentFloorId = useCurrentFloorId();
  const isReady = useMapDocumentReady();
  const { commands } = useMapDocumentActions();
  const selectDevice = useMapStore((state) => state.selectDevice);
  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);
  const reactFlow = useReactFlow();

  const locations = useMemo(
    () =>
      [
        ...new Set(
          inventory.map((item) => netBoxLocationLabel(item.locationPath)),
        ),
      ].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })),
    [inventory],
  );
  const visibleInventory = useMemo(
    () =>
      inventory.filter((item) =>
        matchesNetBoxInventoryFilters(item, {
          query: deferredQuery,
          type,
          location,
          hidePlaced,
        }),
      ),
    [deferredQuery, hidePlaced, inventory, location, type],
  );
  const selectedItems = useMemo(
    () =>
      inventory.filter(
        (item) => selectedIds.has(item.externalId) && !item.placement,
      ),
    [inventory, selectedIds],
  );
  const discoveryByExternalId = useMemo(() => {
    const index = new Map<string, (typeof discoveries)[number]>();
    for (const discovery of discoveries) {
      index.set(discovery.computerExternalId, discovery);
      index.set(discovery.socketExternalId, discovery);
    }
    return index;
  }, [discoveries]);
  // TanStack Virtual owns its mutable measurement callbacks; this component is
  // intentionally excluded from compiler memoization above.
  // oxlint-disable-next-line react-hooks-js/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: visibleInventory.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 132,
    overscan: 8,
  });
  const availableCount = syncState?.inventoryCount ?? 0;
  const isLoading =
    inventoryResult === undefined || discoveriesResult === undefined;

  const toggleSelection = (externalId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of visibleInventory) {
        if (!item.placement) next.add(item.externalId);
      }
      return next;
    });
  };

  const handlePlaceSelection = () => {
    if (
      !currentFloorId ||
      !isReady ||
      !isEditMode ||
      selectedItems.length === 0
    ) {
      return;
    }

    const { x, y, zoom } = reactFlow.getViewport();
    const center = {
      x: (-x + window.innerWidth / 2) / zoom,
      y: (-y + window.innerHeight / 2) / zoom,
    };
    const itemById = new Map(
      selectedItems.map((item) => [item.externalId, item]),
    );
    const placements = layoutInventoryGrid({
      items: selectedItems.map((item) => ({
        id: item.externalId,
        size: getDeviceKind(item.type).defaultSize,
      })),
      center,
      isBlocked: (item, position) =>
        commands.checkCollision(
          currentFloorId,
          `device:netbox-preview:${item.id}` as DeviceId,
          position,
          item.size,
        ),
    });
    if (placements.length !== selectedItems.length) return;
    const drafts: Array<DeviceDraft> = placements.flatMap((placement) => {
      const item = itemById.get(placement.id);
      if (!item) return [];
      return [
        {
          floorId: currentFloorId,
          type: item.type,
          name: item.name,
          hostname: item.hostname,
          size: placement.size,
          position: placement.position,
          metadata: {
            ip: item.ip,
            model: item.model,
            status: "unknown" as const,
            source: {
              provider: "netbox" as const,
              siteId: asSiteId(item.siteId),
              instanceKey: item.instanceKey,
              externalId: item.externalId,
              url: item.url,
              location: item.location,
              locationPath: item.locationPath,
              role: item.role,
              lifecycleStatus: item.lifecycleStatus,
              syncedAt: item.syncedAt,
            },
          },
        },
      ];
    });
    const deviceIds = commands.addDevices(drafts);
    if (deviceIds.length === 1) selectDevice(deviceIds[0]);
    else selectDevice(null);
    setActiveDrawTool("device");
    setSelectedIds(new Set());
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="secondary"
            size="sm"
            className="h-auto gap-2 px-3 py-1.5"
          />
        }
      >
        <HugeiconsIcon icon={DatabaseIcon} size={18} strokeWidth={1.5} />
        NetBox
        {availableCount > 0 ? (
          <Badge variant="outline" className="bg-background">
            {availableCount}
          </Badge>
        ) : null}
      </SheetTrigger>

      <SheetContent className="w-[min(94vw,44rem)]! max-w-none! gap-0 sm:max-w-none!">
        <SheetHeader className="border-b pr-14">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-56 flex-1">
              <SheetTitle className="flex items-center gap-2 text-base">
                <HugeiconsIcon
                  icon={DatabaseIcon}
                  size={20}
                  strokeWidth={1.5}
                />
                Inventaire NetBox
                {site ? ` · ${site.displayName}` : ""}
              </SheetTitle>
              <SheetDescription className="mt-1">
                Filtrez, sélectionnez un groupe, puis placez-le en une fois sur
                l’étage courant.
              </SheetDescription>
            </div>
          </div>
          {syncState?.status === "error" ? (
            <p className="mt-2 rounded-md border border-destructive bg-background px-3 py-2 text-xs text-destructive">
              {syncState.error}
            </p>
          ) : null}
          {libreNmsState?.status === "error" &&
          libreNmsState.error !== syncState?.error ? (
            <p className="mt-2 rounded-md border border-destructive bg-background px-3 py-2 text-xs text-destructive">
              {libreNmsState.error}
            </p>
          ) : null}
        </SheetHeader>

        <div className="space-y-3 border-b p-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom, modèle, IP, rôle ou emplacement…"
          />
          <div className="flex flex-wrap gap-1.5">
            {typeFilters.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                size="xs"
                variant={type === filter.value ? "secondary" : "ghost"}
                onClick={() => setType(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="h-8 min-w-52 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="all">Tous les emplacements</option>
              {locations.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={hidePlaced}
                onChange={(event) => setHidePlaced(event.target.checked)}
                className="size-4 accent-primary"
              />
              Masquer les placés
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <span className="text-muted-foreground">
              {visibleInventory.length} résultat
              {visibleInventory.length > 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              {selectedItems.length > 0 ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Effacer
                </Button>
              ) : null}
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={selectAllVisible}
                disabled={visibleInventory.every((item) => item.placement)}
              >
                Tout sélectionner
              </Button>
            </div>
          </div>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-full min-h-52 items-center justify-center p-8 text-sm text-muted-foreground">
              Chargement de l’inventaire…
            </div>
          ) : (
            <div
              className="relative mx-4 mt-4"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = visibleInventory[virtualRow.index];
                const Icon = typeIcons[item.type];
                const isPlaced = Boolean(item.placement);
                const isSelected = selectedIds.has(item.externalId);
                const discovery = discoveryByExternalId.get(item.externalId);
                const discoveryLabel = discovery
                  ? discovery.computerExternalId === item.externalId
                    ? `Prise ${discovery.socketName}`
                    : discovery.computerName
                  : null;
                const placementLabel = item.placement
                  ? item.placement.floorId === currentFloorId
                    ? "Sur cet étage"
                    : "Déjà placé"
                  : null;
                return (
                  <div
                    key={item.externalId}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute top-0 left-0 w-full pb-2"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <article
                      onClick={() => {
                        if (!isPlaced) toggleSelection(item.externalId);
                      }}
                      className={cn(
                        "rounded-lg border bg-card p-3 shadow-xs transition-colors",
                        !isPlaced && "cursor-pointer hover:bg-accent",
                        isSelected
                          ? "border-primary ring-1 ring-primary"
                          : "border-border",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isPlaced}
                          onChange={() => toggleSelection(item.externalId)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Sélectionner ${item.name}`}
                          className="mt-2 size-4 shrink-0 accent-primary"
                        />
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                          <HugeiconsIcon
                            icon={Icon}
                            size={19}
                            strokeWidth={1.5}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="truncate font-medium text-foreground">
                                {item.name}
                              </h3>
                              <p className="truncate text-xs text-muted-foreground">
                                {netBoxEquipmentLabel(
                                  item.role,
                                  item.type,
                                  item.model,
                                )}
                              </p>
                            </div>
                            <Badge variant="outline">
                              {netBoxLifecycleLabel(item.lifecycleStatus)}
                            </Badge>
                          </div>
                          <p className="mt-2 truncate text-xs text-muted-foreground">
                            {netBoxLocationLabel(item.locationPath)}
                          </p>
                          {discoveryLabel && discovery ? (
                            <div className="mt-2 flex items-center gap-2 text-xs">
                              <span className="size-1.5 rounded-full bg-primary" />
                              <span className="truncate font-medium text-foreground">
                                {discoveryLabel}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                · {discovery.method.toUpperCase()}
                              </span>
                            </div>
                          ) : null}
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="truncate font-mono text-xs text-muted-foreground">
                              {item.ip ?? "Aucune adresse IP"}
                            </span>
                            {placementLabel ? (
                              <Badge variant="outline">{placementLabel}</Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  </div>
                );
              })}

              {visibleInventory.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
                  <p className="font-medium text-foreground">
                    Aucun équipement à afficher
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Élargissez les filtres ou affichez les équipements placés.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <SheetFooter className="border-t bg-background">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-64 flex-1">
              <p className="font-medium text-foreground">
                {selectedItems.length > 0
                  ? `${selectedItems.length} équipement${selectedItems.length > 1 ? "s" : ""} sélectionné${selectedItems.length > 1 ? "s" : ""}`
                  : "Sélectionnez les équipements à placer"}
              </p>
              <p className="text-xs text-muted-foreground">
                Disposition automatique, puis ajustement libre sur la carte.
              </p>
            </div>
            <Button
              onClick={handlePlaceSelection}
              disabled={
                selectedItems.length === 0 ||
                !currentFloorId ||
                !isReady ||
                !isEditMode
              }
              className="shrink-0"
            >
              {selectedItems.length > 0
                ? `Placer ${selectedItems.length}`
                : "Placer la sélection"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {syncState?.status === "success"
              ? `${syncState.inventoryCount} équipements · ${discoveries.length} PC reliés · synchronisé le ${syncDate(syncState.lastSuccessAt)}`
              : syncState?.status === "running"
                ? "Synchronisation en cours..."
                : syncState?.status === "error"
                  ? "Synchronisation indisponible"
                  : "Inventaire non synchronisé"}
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
