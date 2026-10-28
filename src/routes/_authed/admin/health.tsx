import { Alert02Icon, PauseIcon } from "@hugeicons/core-free-icons";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { IconNote } from "@/components/icon-note";
import { Time } from "@/components/time";
import { buttonVariants } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { CollectionFreshness } from "@/sites/CollectionFreshness";
import { describeFreshness } from "@/sites/freshness";
import type { SitePart } from "@/admin/SiteNav";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import type { IntegrationKind } from "@/sites/integrations";
import { Pending } from "@/components/pending";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/admin/health")({
  head: () => ({ meta: [{ title: "Santé · Administration" }] }),
  component: HealthPage,
});

type SiteHealth = FunctionReturnType<typeof api.health.overview>[number];

function HealthPage() {
  const sites = useQuery(api.health.overview);
  const now = useNow(30_000);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Santé</h1>

      {/* The kill switch holds for the whole server, so every site says it.
          No control here turns it back on: the variable names the way. */}
      {sites?.[0]?.freshness.paused ? (
        <div className="rounded-lg border border-down bg-down-background p-3">
          <IconNote icon={PauseIcon} className="text-foreground">
            Collecte suspendue par{" "}
            <code className="font-mono text-xs">NETPLAN_COLLECTION_PAUSED</code>
          </IconNote>
        </div>
      ) : null}

      {sites === undefined ? (
        <Pending />
      ) : sites.length === 0 ? (
        <Link
          to="/admin/sites"
          search={{ create: true }}
          className={buttonVariants({ className: "self-start" })}
        >
          Créer un site
        </Link>
      ) : (
        <ul className="space-y-4">
          {sites
            // Sites in trouble first, then by name as the server sends them.
            .toSorted(
              (a, b) => Number(needsLook(b, now)) - Number(needsLook(a, now)),
            )
            .map((site) => (
              <SiteCard key={site.id} site={site} now={now} />
            ))}
        </ul>
      )}
    </div>
  );
}

/** A failing source, a late site or a refused push puts a site first. */
const needsLook = (site: SiteHealth, now: number) =>
  site.freshness.failures > 0 ||
  describeFreshness(site.freshness, now).tone === "late" ||
  (site.last?.steps.some((step) => !step.ok) ?? false) ||
  (site.netbox?.push?.failing.length ?? 0) > 0;

const certificateWarning = (kinds: ReadonlyArray<IntegrationKind>) => {
  const names = kinds.map((kind) => INTEGRATION_LABELS[kind]).join(" et ");
  return kinds.length > 1
    ? `Certificats TLS de ${names} non vérifiés`
    : `Certificat TLS de ${names} non vérifié`;
};

const Dot = ({ className }: { className: string }) => (
  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", className)} />
);

const linkClass = "text-primary underline underline-offset-4";

function SiteLink({
  siteId,
  part,
  children,
}: {
  siteId: string;
  part: SitePart;
  children: ReactNode;
}) {
  return (
    <Link
      to="/admin/sites/$siteId"
      params={{ siteId }}
      hash={part}
      className={linkClass}
    >
      {children}
    </Link>
  );
}

const counted = (n: number, one: string, many: string) =>
  `${n} ${n > 1 ? many : one}`;

function SiteCard({ site, now }: { site: SiteHealth; now: number }) {
  const { freshness, last, netbox, switches, switchReads } = site;
  const polled = last?.steps.find(
    (step) => step.source === "librenms",
  )?.switches;
  const switchTotal = switches.up + switches.down + switches.unknown;
  const failedSteps = last?.steps.filter((step) => !step.ok) ?? [];

  return (
    <li className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <Link
          to="/admin/sites/$siteId"
          params={{ siteId: site.id }}
          className="font-medium hover:underline"
        >
          {site.name}
        </Link>
        <CollectionFreshness siteId={site.id} linkToSettings={false} />
      </div>

      {/* A fact with nothing to tell is left out. */}
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {last ? (
          <Fact label="Dernière collecte">
            <Time at={last.finishedAt} now={now} format="when" />,{" "}
            {last.manual ? "manuelle" : "automatique"}
          </Fact>
        ) : null}
        {freshness.failures > 0 ? (
          <Fact label="Échecs de suite">
            <span className="flex items-center gap-1.5 font-medium text-down">
              <Dot className="bg-down" />
              {freshness.failures}
            </span>
          </Fact>
        ) : null}
        {netbox === null ? null : (
          <Fact label="Import NetBox">
            {netbox.importedAt === null ? (
              "Jamais"
            ) : (
              <div className="space-y-0.5">
                <Time at={netbox.importedAt} now={now} format="age" />
                <NetBoxNotes siteId={site.id} netbox={netbox} />
              </div>
            )}
          </Fact>
        )}
        {switchTotal === 0 ? null : (
          <Fact label="Switchs">
            <div className="space-y-0.5">
              {switchReads ? (
                <p>
                  {[
                    `${switchReads.read} ${switchReads.read > 1 ? "lus" : "lu"}`,
                    switchReads.failed > 0
                      ? `${switchReads.failed} en échec`
                      : null,
                    switchReads.notPolled > 0
                      ? `${switchReads.notPolled} non ${switchReads.notPolled > 1 ? "interrogés" : "interrogé"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              ) : null}
              <p className="flex flex-wrap gap-x-3 text-muted-foreground">
                <Count dot="bg-up" n={switches.up} label="en ligne" />
                <Count dot="bg-down" n={switches.down} label="hors ligne" />
                <Count
                  dot="bg-muted-foreground"
                  n={switches.unknown}
                  label={switches.unknown > 1 ? "inconnus" : "inconnu"}
                />
              </p>
              {switchReads?.oldestReadAt ? (
                <p className="text-xs text-muted-foreground">
                  Statut le plus ancien lu{" "}
                  <Time at={switchReads.oldestReadAt} now={now} format="age" />
                </p>
              ) : null}
            </div>
          </Fact>
        )}
      </dl>

      {site.ignoringCertificates.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warning bg-warning-background p-3">
          <IconNote icon={Alert02Icon} className="text-foreground">
            {certificateWarning(site.ignoringCertificates)}
          </IconNote>
          <SiteLink siteId={site.id} part="integrations">
            Revoir la connexion
          </SiteLink>
        </div>
      ) : null}

      {last && last.steps.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {last.steps.map((step) => (
            <li key={step.source} className="flex items-baseline gap-2">
              <Dot
                className={cn(
                  "translate-y-[-1px]",
                  step.ok ? "bg-up" : "bg-down",
                )}
              />
              <span>
                <span className="font-medium">
                  {INTEGRATION_LABELS[step.source]}
                </span>
                {step.message ? (
                  <span className="ms-2 text-muted-foreground">
                    {step.message}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {failedSteps.length > 0 ? (
        <p className="text-sm">
          <SiteLink siteId={site.id} part="integrations">
            Ouvrir les intégrations du site
          </SiteLink>
        </p>
      ) : null}

      {polled && polled.length > 0 ? (
        <PolledSwitches siteId={site.id} polled={polled} />
      ) : null}

      {netbox?.push ? <PushHealth push={netbox.push} now={now} /> : null}
    </li>
  );
}

/**
 * What NetBox no longer returns, and the roles it has that no type is chosen
 * for (ADR 0039): two quiet lines, only when there is something to say.
 */
function NetBoxNotes({
  siteId,
  netbox,
}: {
  siteId: string;
  netbox: NonNullable<SiteHealth["netbox"]>;
}) {
  const { absent, unmappedRoles } = netbox;
  return (
    <>
      {absent > 0 ? (
        <p className="text-xs text-muted-foreground">
          <Link
            to="/inventory"
            search={{ site: siteId, absent: true }}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {counted(absent, "absent de NetBox", "absents de NetBox")}
          </Link>
        </p>
      ) : null}
      {unmappedRoles.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          <SiteLink siteId={siteId} part="correspondances">
            {counted(unmappedRoles.length, "rôle sans type", "rôles sans type")}
          </SiteLink>{" "}
          {unmappedRoles
            .map((role) => `${role.name} (${role.devices})`)
            .join(", ")}
        </p>
      ) : null}
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// A zero says nothing a missing line would not, and its red dot alarms.
function Count({ dot, n, label }: { dot: string; n: number; label: string }) {
  if (n === 0) return null;
  return (
    <span className="flex items-center gap-1.5 tabular-nums">
      <Dot className={dot} />
      {n} {label}
    </span>
  );
}

type Polled = NonNullable<
  NonNullable<SiteHealth["last"]>["steps"][number]["switches"]
>;

// How the MAC table's freshness rule fell back, said in passing: it comes
// back by itself, so it is no remark (ADR 0038).
const MAC_TABLE_TEXT = {
  undated: "Table MAC non datée",
  stale: "Table MAC non rafraîchie",
} as const;

/**
 * Each polled switch's result in the last LibreNMS read, failures first: a
 * red dot for a switch not read, amber for one read with a remark.
 */
function PolledSwitches({
  siteId,
  polled,
}: {
  siteId: string;
  polled: Polled;
}) {
  const failed = polled.filter((entry) => !entry.ok).length;
  const ordered = polled.toSorted(
    (a, b) => Number(a.ok) - Number(b.ok) || b.notes.length - a.notes.length,
  );
  const missing = polled.some((entry) => entry.missing);
  return (
    // A failing switch keeps the list open; a healthy site folds it away.
    <details open={failed > 0} className="text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {counted(
          polled.length,
          "équipement LibreNMS interrogé",
          "équipements LibreNMS interrogés",
        )}
        {failed > 0 ? `, ${failed} en échec` : ""}
      </summary>
      <ul className="mt-2 divide-y rounded-lg border">
        {ordered.map((entry, index) => (
          <li
            key={`${entry.name}-${index}`}
            className="flex items-baseline gap-2 px-3 py-2"
          >
            <Dot
              className={cn(
                "translate-y-[-1px]",
                !entry.ok
                  ? "bg-down"
                  : entry.notes.length > 0
                    ? "bg-warning"
                    : "bg-up",
              )}
            />
            <span className="flex min-w-0 flex-wrap gap-x-2 break-words">
              <span className="font-medium">{entry.name}</span>
              <span className="text-muted-foreground">
                {entry.notes.length > 0 ? entry.notes.join(" ") : "Lu"}
              </span>
              {entry.macTable ? (
                <span className="text-muted-foreground">
                  {MAC_TABLE_TEXT[entry.macTable]}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {missing ? (
        <p className="mt-2">
          <SiteLink siteId={siteId} part="correspondances">
            Revoir la correspondance des switchs
          </SiteLink>
        </p>
      ) : null}
    </details>
  );
}

type Push = NonNullable<NonNullable<SiteHealth["netbox"]>["push"]>;

const devices = (n: number) => `${n} ${n > 1 ? "équipements" : "équipement"}`;

const describePush = (last: NonNullable<Push["last"]>) => {
  const parts = [];
  if (last.sent > 0) parts.push(`${devices(last.sent)} mis à jour`);
  if (last.refused > 0) {
    parts.push(`${last.refused} ${last.refused > 1 ? "refusés" : "refusé"}`);
  }
  if (last.error) parts.push(last.error);
  return parts.length > 0 ? parts.join(", ") : "rien à mettre à jour";
};

/** The last push run to NetBox and every device NetBox still refuses. */
function PushHealth({ push, now }: { push: Push; now: number }) {
  const { last, failing, more } = push;
  const ok = !last?.error && failing.length === 0;
  return (
    <div className="space-y-2 text-sm">
      <p className="flex items-baseline gap-2">
        <Dot
          className={cn(
            "translate-y-[-1px]",
            last === null ? "bg-muted-foreground" : ok ? "bg-up" : "bg-down",
          )}
        />
        <span className="flex flex-wrap gap-x-2">
          <span className="font-medium">Envoi vers NetBox</span>
          {last === null ? null : (
            <>
              <span className="text-muted-foreground">
                {describePush(last)}
              </span>
              <span className="text-muted-foreground">
                <Time at={last.finishedAt} now={now} format="age" />
              </span>
            </>
          )}
        </span>
      </p>
      {failing.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {failing.map((entry) => (
            <li key={entry.deviceId} className="space-y-0.5 px-3 py-2">
              <p className="flex items-baseline gap-2">
                <Dot className="bg-down" />
                <span className="font-medium">{entry.deviceName}</span>
                <span className="text-muted-foreground">{entry.message}</span>
              </p>
              <p className="ps-4 text-xs text-muted-foreground">
                En échec depuis{" "}
                <Time at={entry.failingSince} now={now} format="when" />
              </p>
            </li>
          ))}
          {more ? (
            <li className="px-3 py-2 text-muted-foreground">
              Et d'autres équipements en échec.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
