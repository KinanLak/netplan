import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { useEffect, useId, useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { ListPageSkeleton, ListSkeleton } from "@/components/loading-skeletons";
import { AppNavLinks, UserMenu } from "@/components/app-nav";
import { NetplanLogo } from "@/components/netplan-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
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
import { DEVICE_STATUS_LABELS } from "@/devices/status";
import { cn } from "@/lib/utils";
import {
  readHiddenColumns,
  sortRows,
  writeHiddenColumns,
} from "@/inventory/columns";
import {
  applyFilters,
  facetCounts,
  NO_FILTERS,
  filtersOf,
  isFiltered,
  parseInventorySearch,
  sortOf,
  toSearch,
} from "@/inventory/filters";
import type { Sort } from "@/inventory/columns";
import type {
  InventoryFilters,
  InventorySearch,
  Placement,
} from "@/inventory/filters";
import { ColumnPicker, InventoryTable } from "@/inventory/InventoryTable";
import { openPlacement } from "@/inventory/showOnMap";
import { useRestoredScroll } from "@/inventory/useRestoredScroll";
import { useTableRoom } from "@/inventory/useTableRoom";
import { ImportReviews } from "@/sites/ImportReviews";
import { SiteSwitcher } from "@/sites/SiteSwitcher";
import { UnknownMacs } from "@/sites/UnknownMacs";
import { CreateDeviceDialog } from "@/devices/CreateDeviceDialog";
import { Segmented } from "@/components/segmented";
import { UnderlineTabs } from "@/components/underline-tabs";
import {
  siteSearch,
  useCanEditSite,
  useCurrentSite,
} from "@/sites/useCurrentSite";
import type { SiteSummary } from "@/sites/useCurrentSite";
import type { DeviceStatus, DeviceType } from "@/types/map";
import { api } from "../../../convex/_generated/api";

type StatusFilter = "all" | DeviceStatus;
type TypeFilter = "all" | DeviceType;

/**
 * Filters and order live in the URL (A62), and so do the unknown MACs'
 * search and their ignored list's state; the map's links open it filtered.
 */
const inventorySearch = (
  search: Record<string, unknown>,
): InventorySearch & {
  site?: string;
  view?: "unknown";
  mq?: string;
  ignored?: true;
} => ({
  ...siteSearch(search),
  ...parseInventorySearch(search),
  view: search.view === "unknown" ? ("unknown" as const) : undefined,
  mq: typeof search.mq === "string" && search.mq !== "" ? search.mq : undefined,
  ignored: search.ignored === true || search.ignored === "1" ? true : undefined,
});

export const Route = createFileRoute("/_authed/inventory")({
  ssr: false,
  // Rendered by the server, so a slow link shows the frame at once.
  pendingComponent: ListPageSkeleton,
  validateSearch: inventorySearch,
  head: () => ({ meta: [{ title: "Inventaire" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { sites, site } = useCurrentSite();
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
      <main
        data-scroll-restoration-id="inventory-page"
        className="min-w-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-6xl p-4 md:p-8">
          {site === undefined ? (
            <ListSkeleton />
          ) : site === null ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {sites && sites.length > 0
                ? "Tous les sites sont archivés."
                : "Aucun site n'est encore configuré."}
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

function SiteInventory({ site }: { site: SiteSummary }) {
  const devices = useQuery(api.devices.listForSite, { siteId: site.id });
  const canEdit = useCanEditSite();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // Typing runs ahead of the URL: each navigation first waits for the root's
  // session check, and a field fed only by the URL would drop keystrokes.
  const [draft, setDraft] = useState<string | null>(null);
  const fromUrl = filtersOf(search);
  const filters = { ...fromUrl, query: draft ?? fromUrl.query };
  const sort = sortOf(search);
  const [creating, setCreating] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [macDraft, setMacDraft] = useState<string | null>(null);
  const { measureFilters, room: tableHeight } = useTableRoom();
  const goTo = useNavigate();
  const [hidden, setHidden] = useState(readHiddenColumns);
  useSlashToSearch();
  useRestoredScroll("inventory-page", devices !== undefined);
  useRestoredScroll("inventory-table", devices !== undefined);

  const navigateTo = (next: Partial<InventoryFilters>, nextSort: Sort) =>
    navigate({
      search: (current) => ({
        ...siteSearch(current),
        mq: current.mq,
        ignored: current.ignored,
        ...toSearch({ ...filters, ...next }, nextSort),
      }),
      replace: true,
      // A filter changes the rows, not where the reader is; the router would
      // otherwise put back the table's old scroll over a row just scrolled to
      // (A60).
      resetScroll: false,
    });
  const update = (next: Partial<InventoryFilters>, nextSort = sort) => {
    if (next.query !== undefined) setDraft(null);
    void navigateTo(next, nextSort);
  };
  const typeQuery = (query: string) => {
    setDraft(query);
    void navigateTo({ query }, sort).then(() =>
      setDraft((current) => (current === query ? null : current)),
    );
  };

  const setMacSearch = (next: { mq?: string; ignored?: true }) =>
    navigate({
      search: (current) => ({ ...current, ...next }),
      replace: true,
      resetScroll: false,
    });
  const typeMacQuery = (query: string) => {
    setMacDraft(query);
    void setMacSearch({ mq: query || undefined }).then(() =>
      setMacDraft((current) => (current === query ? null : current)),
    );
  };

  const all = devices ?? [];
  // Only Éditeurs see unknown MACs, and only a site that has some gets a tab.
  const unknownMacs = useQuery(
    api.unknownMacs.listForSite,
    canEdit ? { siteId: site.id } : "skip",
  );
  const ignoredMacs = useQuery(
    api.unknownMacs.listIgnored,
    canEdit ? { siteId: site.id } : "skip",
  );
  const macTabs = (unknownMacs?.length ?? 0) + (ignoredMacs?.length ?? 0) > 0;
  const view = search.view ?? "devices";
  const coverage = coverageByType(all);
  // A type whose last device went away, here or in another tab, filters nothing.
  const type = coverage.some((entry) => entry.type === filters.type)
    ? filters.type
    : "all";
  const active = { ...filters, type };
  const counts = facetCounts(all, active);
  const typeFilters = [
    { value: "all" as const, label: "Tous les types" },
    ...coverage.map((entry) => ({
      value: entry.type,
      label: getDeviceKindLabel(entry.type),
    })),
  ];
  const shown = sortRows(applyFilters(all, active), sort);
  const filtered = isFiltered(active);
  const reset = () => update(NO_FILTERS);
  // From a toast, which outlives the render it was made in: the filters are
  // cleared from the URL as it is then, keeping the reader's order, and the
  // devices' tab comes back.
  const showEveryDevice = () => {
    setDraft(null);
    void navigate({
      search: (current) => ({
        ...siteSearch(current),
        mq: current.mq,
        ignored: current.ignored,
        ...toSearch(NO_FILTERS, sortOf(current)),
      }),
      replace: true,
      resetScroll: false,
    });
  };

  // A coverage count shows what is left to draw, so no other filter may hide it.
  const showUnplaced = (next: TypeFilter) => {
    const again = type === next && filters.placement === "unplaced";
    update({
      query: "",
      status: "all",
      absent: false,
      type: again ? "all" : next,
      placement: again ? "all" : "unplaced",
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Inventaire</h1>
          <p className="text-sm text-muted-foreground">
            Tous les équipements du site, sur le plan ou hors plan.
          </p>
          <CollectionFreshness
            siteId={site.id}
            className="mt-3 w-fit max-w-sm"
          />
        </div>
        {/* An empty inventory offers the same button in its message. */}
        {canEdit && all.length > 0 ? (
          <Button onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Nouvel équipement
          </Button>
        ) : null}
      </header>

      {canEdit ? <ImportReviews siteId={site.id} /> : null}

      {macTabs ? (
        <UnderlineTabs
          label="Vue"
          idPrefix="inventory"
          value={view}
          onChange={(next) =>
            void navigate({
              search: (current) => ({
                ...current,
                view: next === "unknown" ? ("unknown" as const) : undefined,
              }),
              replace: true,
            })
          }
          tabs={[
            { value: "devices", label: "Équipements", count: all.length },
            {
              value: "unknown",
              label: "MAC inconnues",
              count: unknownMacs?.length ?? 0,
            },
          ]}
        />
      ) : null}

      {macTabs && view === "unknown" ? (
        <div
          id="inventory-panel"
          role="tabpanel"
          aria-labelledby="inventory-tab-unknown"
        >
          <UnknownMacs
            siteId={site.id}
            query={macDraft ?? search.mq ?? ""}
            onQueryChange={typeMacQuery}
            showIgnored={search.ignored === true}
            onShowIgnoredChange={(open) =>
              void setMacSearch({ ignored: open ? true : undefined })
            }
          />
        </div>
      ) : (
        <div
          id="inventory-panel"
          role={macTabs ? "tabpanel" : undefined}
          aria-labelledby={macTabs ? "inventory-tab-devices" : undefined}
          className="space-y-6"
        >
          {coverage.length > 0 ? (
            <PlanCoverage
              coverage={coverage}
              active={filters.placement === "unplaced" ? type : null}
              canEdit={canEdit}
              onSelect={showUnplaced}
            />
          ) : null}

          {devices === undefined ? (
            <ListSkeleton />
          ) : all.length === 0 ? (
            <InventoryEmpty
              canEdit={canEdit}
              onCreate={() => setCreating(true)}
            />
          ) : (
            <>
              {/* The filters stay in reach while the page scrolls (A63). */}
              <div
                ref={measureFilters}
                className="sticky top-0 z-20 -mx-1 space-y-3 bg-background px-1 pt-2 pb-3"
              >
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
                      value={filters.query}
                      onChange={(event) => typeQuery(event.target.value)}
                      placeholder="Nom, hostname, MAC, IP, emplacement…"
                      aria-label="Rechercher un équipement"
                      aria-keyshortcuts="/"
                      className="pr-9 pl-8"
                    />
                    {filters.query ? null : (
                      <Kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2">
                        /
                      </Kbd>
                    )}
                  </div>
                  <Segmented
                    label="Emplacement"
                    value={filters.placement}
                    onChange={(placement) => update({ placement })}
                    options={PLACEMENT_FILTERS.map(({ value, label }) => ({
                      value,
                      label,
                      count: counts.placement[value],
                    }))}
                  />
                  <Segmented
                    label="État"
                    value={filters.status}
                    onChange={(status) => update({ status })}
                    options={STATUS_FILTERS.map(({ value, label }) => ({
                      value,
                      label,
                      count: counts.status[value],
                    }))}
                  />
                  <Select
                    items={typeFilters}
                    value={type}
                    onValueChange={(value) => {
                      if (value) update({ type: value });
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

                <div className="flex items-center justify-between gap-3">
                  <p
                    className="text-sm text-muted-foreground"
                    aria-live="polite"
                  >
                    {filtered
                      ? `${shown.length} sur ${all.length} équipement${all.length > 1 ? "s" : ""}`
                      : `${all.length} équipement${all.length > 1 ? "s" : ""}`}
                    {/* Shown only when NetBox has dropped some (ADR 0039). */}
                    {counts.absent > 0 || active.absent ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          aria-pressed={active.absent}
                          onClick={() => update({ absent: !active.absent })}
                          className={cn(
                            "rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring",
                            active.absent && "font-medium text-foreground",
                          )}
                        >
                          {counts.absent}{" "}
                          {counts.absent > 1
                            ? "absents de NetBox"
                            : "absent de NetBox"}
                        </button>
                      </>
                    ) : null}
                    {/* An empty list offers the same button in its message. */}
                    {filtered && shown.length > 0 ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={reset}
                          className="rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
                        >
                          Réinitialiser les filtres
                        </button>
                      </>
                    ) : null}
                  </p>
                  <ColumnPicker
                    hidden={hidden}
                    onChange={(next) => {
                      setHidden(next);
                      writeHiddenColumns(next);
                    }}
                  />
                </div>
              </div>

              {shown.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <p>Aucun équipement ne correspond à ces filtres.</p>
                  <Button variant="outline" size="sm" onClick={reset}>
                    Réinitialiser les filtres
                  </Button>
                </div>
              ) : (
                <InventoryTable
                  rows={shown}
                  site={site}
                  canEdit={canEdit}
                  hidden={hidden}
                  sort={sort}
                  onSort={(next) => update({}, next)}
                  highlightId={highlightId}
                  sheetId={sheetId}
                  onSheetChange={setSheetId}
                  maxHeight={tableHeight}
                />
              )}
            </>
          )}
        </div>
      )}

      {canEdit ? (
        <CreateDeviceDialog
          site={site}
          open={creating}
          onOpenChange={setCreating}
          onCreated={(deviceId, name) => {
            // The new row may hide behind a filter, and in a long list it is
            // easy to miss: show it, light it, and say where it is (A60).
            showEveryDevice();
            setHighlightId(deviceId);
            window.setTimeout(
              () =>
                setHighlightId((current) =>
                  current === deviceId ? null : current,
                ),
              2_500,
            );
            toast(`« ${name} » créé, hors plan`, {
              // The row may have been filtered out since: show it again.
              action: {
                label: "Voir",
                onClick: () => {
                  showEveryDevice();
                  setSheetId(deviceId);
                },
              },
              cancel: {
                label: "Placer sur le plan",
                onClick: () => openPlacement(goTo, site.id, deviceId),
              },
              duration: 10_000,
            });
          }}
        />
      ) : null}
    </div>
  );
}

/** « / » puts the cursor in the search, from anywhere but a field. */
function useSlashToSearch() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [role='dialog']"))
      ) {
        return;
      }
      // The tab shown has one search: the devices' or the MACs'.
      const search = document.querySelector<HTMLInputElement>(
        "main input[type='search']",
      );
      if (!search) return;
      event.preventDefault();
      search.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
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
            Un équipement hors plan se place depuis son menu, « Placer sur le
            plan… ».
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
                "flex flex-col gap-2 rounded-lg border p-3 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring enabled:hover:bg-muted",
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
          ? "Créez-en un ici, hors plan, ou placez-le directement sur le plan."
          : "Les équipements du site apparaîtront ici."}
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
