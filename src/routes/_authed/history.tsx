import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Location01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
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
import { CopyValue } from "@/components/copy-value";
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
  isCalendarDay,
  nextDay,
  previousDay,
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

/** The view and its filters, in the URL so a reload or Back keeps them (A62). */
type HistorySearch = {
  site?: string;
  view?: "snapshots";
  q?: string;
  kind?: Exclude<KindFilter, "all">;
  from?: string;
  to?: string;
  /** The site's calendar day of the snapshots shown. */
  day?: string;
  slot?: string;
  /** The search within the snapshot shown (A62). */
  sq?: string;
};

/**
 * Every key is written, `undefined` when invalid: the router merges the raw
 * query of the root route under this one, so a key left out would leak in.
 */
const historySearch = (search: Record<string, unknown>): HistorySearch => ({
  ...siteSearch(search),
  view: search.view === "snapshots" ? "snapshots" : undefined,
  q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
  kind:
    search.kind === "located" ||
    search.kind === "online" ||
    search.kind === "offline"
      ? search.kind
      : undefined,
  from: isCalendarDay(search.from) ? search.from : undefined,
  to: isCalendarDay(search.to) ? search.to : undefined,
  day: isCalendarDay(search.day) ? search.day : undefined,
  slot:
    typeof search.slot === "string" && SNAPSHOT_TIMES.includes(search.slot)
      ? search.slot
      : undefined,
  sq: typeof search.sq === "string" && search.sq !== "" ? search.sq : undefined,
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
            // Each view keeps its own search and filters, so a round trip
            // between them finds both as they were (A62).
            search: (current) => ({
              ...current,
              view: next === "snapshots" ? ("snapshots" as const) : undefined,
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

type Slot = FunctionReturnType<typeof api.history.slotsForDay>[number];

const DAY_MS = 24 * 60 * 60_000;

function SiteSnapshots({ site }: { site: SiteSummary }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // Slots open and close by the minute.
  const now = useNow(60_000);
  const today = siteDay(site.timezone, now);
  const earliest = siteDay(site.timezone, now - 30 * DAY_MS);
  const latest = useQuery(api.history.latestSlot, { siteId: site.id });
  // Without a day in the URL, the view opens on the latest snapshot taken.
  const day =
    search.day ?? (latest === undefined ? undefined : (latest?.day ?? today));
  const slots = useQuery(
    api.history.slotsForDay,
    day === undefined ? "skip" : { siteId: site.id, day },
  );
  const slotOf = new Map((slots ?? []).map((slot) => [slot.time, slot]));
  const taken = SNAPSHOT_TIMES.filter(
    (time) => slotOf.get(time)?.entries !== undefined,
  );
  // Without a slot in the URL, the day's last snapshot taken.
  const time = search.slot ?? taken.at(-1);
  const chosen = time === undefined ? undefined : slotOf.get(time);

  const go = (next: { day?: string; slot?: string }) =>
    void navigate({
      search: (current) => ({ ...current, ...next }),
      replace: true,
    });

  if (day === undefined) return null;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="snapshot-day" className="text-muted-foreground">
            Jour
          </label>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Jour précédent"
              disabled={day <= earliest}
              onClick={() => go({ day: previousDay(day), slot: undefined })}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
            <Input
              id="snapshot-day"
              type="date"
              value={day}
              min={earliest}
              max={today}
              onChange={(event) => {
                if (event.target.value) {
                  go({ day: event.target.value, slot: undefined });
                }
              }}
              className="w-44"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Jour suivant"
              disabled={day >= today}
              onClick={() => go({ day: nextDay(day), slot: undefined })}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </Button>
          </div>
        </div>
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
              // The day goes with the slot, so a new day of snapshots never
              // moves what the reader picked.
              onSelect={() => go({ day, slot: slotTime })}
            />
          ))}
        </div>
      </div>
      {slots === undefined ? null : chosen?.entries !== undefined ? (
        <SlotEntries key={`${day}-${time}`} site={site} slot={chosen} />
      ) : (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {taken.length === 0
            ? "Aucun relevé ce jour-là."
            : "Pas de relevé à cette heure-là : choisissez-en un autre."}
        </p>
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
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // In the URL, so a reload or a trip to the events keeps it (A62); typing
  // runs ahead of the URL, as the events' search does.
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft ?? search.sq ?? "";
  const typeQuery = (text: string) => {
    setDraft(text);
    void navigate({
      search: (current) => ({ ...current, sq: text || undefined }),
      replace: true,
      resetScroll: false,
    }).then(() => setDraft((current) => (current === text ? null : current)));
  };
  const {
    results: shown,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.history.slotEntries,
    {
      siteId: site.id,
      day: slot.day,
      time: slot.time,
      ...(query.trim() && { search: query }),
    },
    { initialNumItems: ENTRY_PAGE },
  );
  // The search runs on the whole snapshot before paging, so a page may hold
  // few rows: read on until a page's worth shows or the snapshot ends.
  useEffect(() => {
    if (query.trim() && status === "CanLoadMore" && shown.length < ENTRY_PAGE) {
      loadMore(ENTRY_PAGE);
    }
  }, [query, status, shown.length, loadMore]);
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
          onChange={(event) => typeQuery(event.target.value)}
          placeholder="MAC, équipement, prise, switch…"
          aria-label="Rechercher dans le relevé"
          className="pl-8"
        />
      </div>
      {status === "LoadingFirstPage" ? null : shown.length === 0 ? (
        status === "Exhausted" ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aucune adresse ne correspond.
          </p>
        ) : null
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
                  <td className="px-4 py-2.5 text-xs">
                    <CopyValue value={entry.mac} label="l'adresse MAC" />
                  </td>
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
