import { HugeiconsIcon } from "@hugeicons/react";
import { Location01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { ListSkeleton } from "@/components/loading-skeletons";
import { AppNavLinks, UserMenu } from "@/components/app-nav";
import { NetplanLogo } from "@/components/netplan-logo";
import { Segmented } from "@/components/segmented";
import { Time } from "@/components/time";
import { UnderlineTabs } from "@/components/underline-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventSummary, LoadMore, PlaceLabel } from "@/history/HistoryLists";
import { DeviceHistoryDialog } from "@/history/DeviceHistoryDialog";
import { timeline } from "@/history/timeline";
import { useCanEdit } from "@/hooks/use-current-user";
import { showOnMap } from "@/inventory/showOnMap";
import { useNow } from "@/hooks/use-now";
import {
  dayOf,
  formatDay,
  formatTime,
  startOfDay,
  timeZoneHint,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { SiteSwitcher } from "@/sites/SiteSwitcher";
import {
  captureRunning,
  SNAPSHOT_TIMES,
  siteDay,
  slotInstant,
  slotStillOpen,
} from "@/sites/snapshots";
import { siteSearch, useCurrentSite } from "@/sites/useCurrentSite";
import type { SiteSummary } from "@/sites/useCurrentSite";
import { api } from "../../../convex/_generated/api";

type KindFilter = "all" | "located" | "online" | "offline";

const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** The view and its filters, in the URL so a reload or Back keeps them (A62). */
type HistorySearch = {
  site?: string;
  view?: "snapshots";
  q?: string;
  kind?: Exclude<KindFilter, "all">;
  from?: string;
  to?: string;
};

const historySearch = (search: Record<string, unknown>): HistorySearch => ({
  ...siteSearch(search),
  ...(search.view === "snapshots" && { view: "snapshots" as const }),
  ...(typeof search.q === "string" && search.q !== "" && { q: search.q }),
  ...((search.kind === "located" ||
    search.kind === "online" ||
    search.kind === "offline") && { kind: search.kind }),
  ...(isDay(search.from) && { from: search.from }),
  ...(isDay(search.to) && { to: search.to }),
});

export const Route = createFileRoute("/_authed/history")({
  ssr: false,
  validateSearch: historySearch,
  head: () => ({ meta: [{ title: "Historique" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { sites, site } = useCurrentSite();
  const canEdit = useCanEdit();
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
          {!canEdit ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              L'historique est réservé aux éditeurs et aux administrateurs.
            </p>
          ) : site === undefined ? (
            <ListSkeleton />
          ) : site === null ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {sites && sites.length > 0
                ? "Tous les sites sont archivés."
                : "Aucun site n'est encore configuré."}
            </p>
          ) : (
            <SiteHistory key={site.id} site={site} />
          )}
        </div>
      </main>
    </div>
  );
}

type View = "events" | "snapshots";

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "located", label: "Déplacements" },
  { value: "online", label: "En ligne" },
  { value: "offline", label: "Hors ligne" },
];

function SiteHistory({ site }: { site: SiteSummary }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const view: View = search.view ?? "events";
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Historique</h1>
        <p className="text-sm text-muted-foreground">
          Ce que le réseau a observé à {site.name} ces 30 derniers jours :
          déplacements, mises en ligne et hors ligne, et cinq relevés par jour.
        </p>
      </header>
      <UnderlineTabs
        label="Vue"
        idPrefix="history"
        value={view}
        onChange={(next) =>
          void navigate({
            search: (current) => ({
              site: current.site,
              ...(next === "snapshots" && { view: "snapshots" as const }),
            }),
            replace: true,
          })
        }
        tabs={[
          { value: "events", label: "Événements" },
          { value: "snapshots", label: "Relevés" },
        ]}
      />
      <div
        id="history-panel"
        role="tabpanel"
        aria-labelledby={`history-tab-${view}`}
      >
        {view === "events" ? (
          <SiteEvents site={site} />
        ) : (
          <SiteSnapshots site={site} />
        )}
      </div>
    </div>
  );
}

const PAGE = 50;

function SiteEvents({ site }: { site: SiteSummary }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const now = useNow(60_000);
  // Typing runs ahead of the URL, which each navigation updates only after
  // the root's session check.
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft ?? search.q ?? "";
  const kind = search.kind ?? "all";
  const [opened, setOpened] = useState<{ id: string; name: string } | null>(
    null,
  );
  const devices = useQuery(api.devices.listForSite, { siteId: site.id });
  const placeOf = new Map(
    (devices ?? []).flatMap((device) =>
      device.location ? [[device.id, device.location] as const] : [],
    ),
  );
  const goTo = useNavigate();

  const setSearch = (next: Partial<HistorySearch>) =>
    navigate({
      search: (current) => {
        const merged = { ...current, q: query || undefined, ...next };
        return Object.fromEntries(
          Object.entries(merged).filter(([, value]) => value !== undefined),
        );
      },
      replace: true,
    });
  const typeQuery = (text: string) => {
    setDraft(text);
    void setSearch({ q: text || undefined }).then(() =>
      setDraft((current) => (current === text ? null : current)),
    );
  };
  const filtered =
    query.trim() !== "" ||
    kind !== "all" ||
    search.from !== undefined ||
    search.to !== undefined;
  const reset = () => {
    setDraft(null);
    void setSearch({
      q: undefined,
      kind: undefined,
      from: undefined,
      to: undefined,
    });
  };

  const { results, status, loadMore } = usePaginatedQuery(
    api.history.forSite,
    {
      siteId: site.id,
      ...(kind !== "all" && { kind }),
      ...(query.trim() && { search: query }),
      ...(search.from && { from: startOfDay(search.from) }),
      ...(search.to && { to: startOfDay(nextDay(search.to)) }),
    },
    { initialNumItems: PAGE },
  );
  // A search filters before paging, so a page may hold few rows: read on
  // until a page's worth shows or the history ends.
  useEffect(() => {
    if (query.trim() && status === "CanLoadMore" && results.length < PAGE) {
      loadMore(PAGE);
    }
  }, [query, status, results.length, loadMore]);

  const earliest = dayOf(now - 30 * DAY_MS);
  const today = dayOf(now);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
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
            onChange={(event) => typeQuery(event.target.value)}
            placeholder="Équipement, MAC, prise, switch…"
            aria-label="Rechercher dans l'historique"
            className="pl-8"
          />
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Du</span>
          <Input
            type="date"
            value={search.from ?? ""}
            min={earliest}
            max={search.to ?? today}
            onChange={(event) =>
              void setSearch({ from: event.target.value || undefined })
            }
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Au</span>
          <Input
            type="date"
            value={search.to ?? ""}
            min={search.from ?? earliest}
            max={today}
            onChange={(event) =>
              void setSearch({ to: event.target.value || undefined })
            }
            className="w-40"
          />
        </label>
        <Segmented
          label="Type d'événement"
          value={kind}
          onChange={(next) =>
            void setSearch({ kind: next === "all" ? undefined : next })
          }
          options={KIND_FILTERS}
        />
      </div>
      {status === "LoadingFirstPage" ? null : results.length === 0 ? (
        status === "Exhausted" ? (
          filtered ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <p>
                {kind === "offline" && !query.trim()
                  ? "Aucun événement hors ligne sur la période."
                  : "Aucun événement ne correspond à ces filtres."}
              </p>
              <Button variant="outline" size="sm" onClick={reset}>
                Réinitialiser les filtres
              </Button>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Rien n'a été observé ces 30 derniers jours. L'historique se
              remplit à chaque collecte LibreNMS.
            </p>
          )
        ) : null
      ) : (
        <div className="space-y-6">
          {timeline(results).map((day) => (
            <section key={day.day} aria-label={formatDay(day.at, now)}>
              <h2 className="mb-2 text-sm font-medium">
                {formatDay(day.at, now)}
              </h2>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {day.rows.map(({ event, cameOnline }) => {
                      const location = placeOf.get(event.deviceId);
                      return (
                        <tr
                          key={`${event.deviceId}-${event.at}-${event.kind}`}
                          className="group align-top hover:bg-muted"
                        >
                          <td className="w-20 px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                            <Time at={event.at} format="time" />
                          </td>
                          <td className="w-64 px-4 py-2.5">
                            <span className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpened({
                                    id: event.deviceId,
                                    name: event.deviceName,
                                  })
                                }
                                className="truncate rounded-sm text-left font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
                                title={`Historique de « ${event.deviceName} »`}
                              >
                                {event.deviceName}
                              </button>
                              {location ? (
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Voir « ${event.deviceName} » sur le plan`}
                                  title="Voir sur le plan"
                                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                  onClick={() =>
                                    showOnMap(
                                      goTo,
                                      site.id,
                                      event.deviceId,
                                      location,
                                    )
                                  }
                                >
                                  <HugeiconsIcon
                                    icon={Location01Icon}
                                    strokeWidth={1.5}
                                  />
                                </Button>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <EventSummary
                              event={event}
                              cameOnline={cameOnline}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
      <LoadMore status={status} onLoadMore={() => loadMore(PAGE)} />
      {opened ? (
        <DeviceHistoryDialog
          device={opened}
          open
          onOpenChange={(open) => {
            if (!open) setOpened(null);
          }}
        />
      ) : null}
    </section>
  );
}

const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

type Slot = FunctionReturnType<typeof api.history.slotsForDay>[number];

const DAY_MS = 24 * 60 * 60_000;

function SiteSnapshots({ site }: { site: SiteSummary }) {
  // Slots open and close by the minute.
  const now = useNow(60_000);
  const today = siteDay(site.timezone, now);
  const [day, setDay] = useState(today);
  const [time, setTime] = useState<string | null>(null);
  const slots = useQuery(api.history.slotsForDay, { siteId: site.id, day });
  const slotOf = new Map((slots ?? []).map((slot) => [slot.time, slot]));
  const chosen = time === null ? undefined : slotOf.get(time);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Jour</span>
          <Input
            type="date"
            value={day}
            min={siteDay(site.timezone, now - 30 * DAY_MS)}
            max={today}
            onChange={(event) => {
              if (event.target.value) setDay(event.target.value);
              setTime(null);
            }}
            className="w-44"
          />
        </label>
        <div role="group" aria-label="Relevé" className="flex flex-wrap gap-2">
          {SNAPSHOT_TIMES.map((slotTime) => (
            <SlotButton
              key={slotTime}
              // A taken slot keeps its instant if the site's zone changes.
              at={
                slotOf.get(slotTime)?.at ??
                slotInstant(site.timezone, day, slotTime)
              }
              slot={slotOf.get(slotTime)}
              open={slotStillOpen(site.timezone, day, slotTime, now)}
              now={now}
              loading={slots === undefined}
              active={time === slotTime}
              onSelect={() => setTime(slotTime)}
            />
          ))}
        </div>
      </div>
      {chosen?.entries === undefined ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Choisissez un relevé pour voir où était chaque adresse MAC.
        </p>
      ) : (
        <SlotEntries site={site} slot={chosen} />
      )}
    </section>
  );
}

function SlotButton({
  at,
  slot,
  open,
  now,
  loading,
  active,
  onSelect,
}: {
  /** When the slot falls, shown on the reader's clock. */
  at: number;
  slot: Slot | undefined;
  open: boolean;
  now: number;
  loading: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const state = loading
    ? ""
    : slot?.entries !== undefined
      ? `${slot.entries} adresse${slot.entries > 1 ? "s" : ""}`
      : slot
        ? captureRunning(slot.takenAt, now)
          ? "En cours"
          : "Pas de relevé"
        : open
          ? "À venir"
          : "Pas de relevé";
  return (
    <button
      type="button"
      disabled={slot?.entries === undefined}
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "flex min-w-28 flex-col rounded-lg border px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring enabled:hover:bg-muted",
        active && "border-primary bg-muted",
      )}
    >
      <span className="font-medium tabular-nums" title={timeZoneHint(at)}>
        {formatTime(at)}
      </span>
      <span className="text-xs text-muted-foreground">{state}</span>
    </button>
  );
}

const ENTRY_PAGE = 500;

function SlotEntries({ site, slot }: { site: SiteSummary; slot: Slot }) {
  const [query, setQuery] = useState("");
  const { results, status, loadMore } = usePaginatedQuery(
    api.history.slotEntries,
    { siteId: site.id, day: slot.day, time: slot.time },
    { initialNumItems: ENTRY_PAGE },
  );
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? results.filter((entry) =>
        [
          entry.mac,
          entry.deviceName,
          entry.place.socketName,
          entry.place.switchName,
          entry.place.portName,
        ].some((value) => value?.toLowerCase().includes(needle)),
      )
    : results;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Relevé pris le <Time at={slot.takenAt} />, par la première collecte de
        sa fenêtre.
      </p>
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
          onChange={(event) => setQuery(event.target.value)}
          placeholder="MAC, équipement, prise, switch…"
          aria-label="Rechercher dans le relevé"
          className="pl-8"
        />
      </div>
      {status === "LoadingFirstPage" ? null : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {status === "Exhausted"
            ? "Aucune adresse ne correspond."
            : "Aucune adresse chargée ne correspond ; chargez la suite du relevé."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Adresse MAC</th>
                <th className="px-4 py-2 font-medium">Équipement</th>
                <th className="px-4 py-2 font-medium">Où</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((entry) => (
                <tr key={entry.mac} className="align-top">
                  <td className="px-4 py-2.5 font-mono text-xs">{entry.mac}</td>
                  <td className="px-4 py-2.5">
                    {entry.deviceName ?? (
                      <span className="text-muted-foreground">Inconnu</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <PlaceLabel place={entry.place} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore status={status} onLoadMore={() => loadMore(ENTRY_PAGE)} />
    </div>
  );
}
