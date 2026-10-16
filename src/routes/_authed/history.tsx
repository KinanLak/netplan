import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Link, createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { NetplanLogo } from "@/components/netplan-logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EventSummary,
  LoadMore,
  PlaceLabel,
  formatHistoryTime,
} from "@/history/HistoryLists";
import { useCanEdit } from "@/hooks/use-current-user";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { SiteSwitcher } from "@/sites/SiteSwitcher";
import {
  captureRunning,
  SNAPSHOT_TIMES,
  siteDay,
  slotStillOpen,
} from "@/sites/snapshots";
import { siteSearch, useCurrentSite } from "@/sites/useCurrentSite";
import type { SiteSummary } from "@/sites/useCurrentSite";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/history")({
  ssr: false,
  validateSearch: siteSearch,
  head: () => ({ meta: [{ title: "Historique · Netplan" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { site } = useCurrentSite();
  const canEdit = useCanEdit();
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
          {!canEdit ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              L'historique est réservé aux éditeurs et aux administrateurs.
            </p>
          ) : site === undefined ? null : site === null ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aucun site n'est encore configuré.
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

function SiteHistory({ site }: { site: SiteSummary }) {
  const [view, setView] = useState<View>("events");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Historique</h1>
        <p className="text-sm text-muted-foreground">
          Ce que le réseau a observé à {site.name} ces 30 derniers jours :
          déplacements, mises en ligne et hors ligne, et les relevés de 8 h, 12
          h, 14 h, 16 h et 19 h.
        </p>
      </header>
      <div
        role="group"
        aria-label="Vue"
        className="flex w-fit gap-1 rounded-lg border p-1"
      >
        <Button
          size="sm"
          variant={view === "events" ? "secondary" : "ghost"}
          aria-pressed={view === "events"}
          onClick={() => setView("events")}
        >
          Événements
        </Button>
        <Button
          size="sm"
          variant={view === "snapshots" ? "secondary" : "ghost"}
          aria-pressed={view === "snapshots"}
          onClick={() => setView("snapshots")}
        >
          Relevés
        </Button>
      </div>
      {view === "events" ? (
        <SiteEvents site={site} />
      ) : (
        <SiteSnapshots site={site} />
      )}
    </div>
  );
}

type KindFilter = "all" | "located" | "online" | "offline";

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "located", label: "Déplacements" },
  { value: "online", label: "En ligne" },
  { value: "offline", label: "Hors ligne" },
];

const PAGE = 50;

function SiteEvents({ site }: { site: SiteSummary }) {
  const [kind, setKind] = useState<KindFilter>("all");
  const { results, status, loadMore } = usePaginatedQuery(
    api.history.forSite,
    { siteId: site.id, ...(kind !== "all" && { kind }) },
    { initialNumItems: PAGE },
  );
  return (
    <section className="space-y-3">
      <div
        role="group"
        aria-label="Type d'événement"
        className="flex w-fit gap-1 rounded-lg border p-1"
      >
        {KIND_FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            size="sm"
            variant={kind === value ? "secondary" : "ghost"}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {status === "LoadingFirstPage" ? null : results.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Rien n'a été observé ces 30 derniers jours. L'historique se remplit à
          chaque collecte LibreNMS.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Quand</th>
                <th className="px-4 py-2 font-medium">Équipement</th>
                <th className="px-4 py-2 font-medium">Observé</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {results.map((event) => (
                <tr
                  key={`${event.deviceId}-${event.at}-${event.kind}`}
                  className="align-top"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatHistoryTime(event.at, site.timezone)}
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    {event.deviceName}
                  </td>
                  <td className="px-4 py-2.5">
                    <EventSummary event={event} timezone={site.timezone} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore status={status} onLoadMore={() => loadMore(PAGE)} />
    </section>
  );
}

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
              time={slotTime}
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
  time,
  slot,
  open,
  now,
  loading,
  active,
  onSelect,
}: {
  time: string;
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
        "flex min-w-28 flex-col rounded-lg border px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:bg-muted",
        active && "border-primary bg-muted",
      )}
    >
      <span className="font-medium tabular-nums">{time}</span>
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
        Relevé pris {formatHistoryTime(slot.takenAt, site.timezone)}, par la
        première collecte de sa fenêtre.
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
