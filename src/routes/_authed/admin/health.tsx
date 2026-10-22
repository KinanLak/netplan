import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { Time } from "@/components/time";
import { useNow } from "@/hooks/use-now";
import { ageHint, timeZoneHint } from "@/lib/time";
import { cn } from "@/lib/utils";
import { FRESHNESS_DOT } from "@/sites/CollectionFreshness";
import { describeFreshness, describeNextRun, nextRun } from "@/sites/freshness";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import type { IntegrationKind } from "@/sites/integrations";
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
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Santé</h1>
        <p className="text-sm text-muted-foreground">
          La collecte de chaque site : ses sources, ses switches et leur état.
        </p>
      </header>

      {/* The kill switch holds for the whole server, so every site says it. */}
      {sites?.[0]?.freshness.paused ? (
        <p className="rounded-lg border border-down bg-down-background p-3 text-sm">
          La collecte est suspendue sur ce serveur (NETPLAN_COLLECTION_PAUSED).
        </p>
      ) : null}

      {sites === undefined ? null : sites.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm">
          <p className="font-medium">Aucun site</p>
          <p className="text-muted-foreground">
            La santé de la collecte s'affiche ici une fois un site créé.
          </p>
          <Link
            to="/admin/sites"
            className="text-primary underline underline-offset-4"
          >
            Créer un site
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {sites.map((site) => (
            <SiteCard key={site.id} site={site} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

const certificateWarning = (kinds: ReadonlyArray<IntegrationKind>) => {
  const names = kinds.map((kind) => INTEGRATION_LABELS[kind]).join(" et ");
  const subject =
    kinds.length > 1
      ? `${names} sont interrogés sans vérifier leur certificat TLS`
      : `${names} est interrogé sans vérifier son certificat TLS`;
  return `${subject} : décochez « Ignorer les erreurs de certificat TLS » dans les intégrations du site une fois le certificat corrigé.`;
};

const Dot = ({ className }: { className: string }) => (
  <span aria-hidden className={cn("size-2 shrink-0 rounded-full", className)} />
);

function SiteCard({ site, now }: { site: SiteHealth; now: number }) {
  const { freshness, last, netbox, switches } = site;
  const { headline, tone } = describeFreshness(freshness, now);
  const next = nextRun(freshness, now);
  const polled = last?.steps.find(
    (step) => step.source === "librenms",
  )?.switches;
  const switchTotal = switches.up + switches.down + switches.unknown;

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
        <div className="flex items-center gap-2 text-sm">
          <Dot className={FRESHNESS_DOT[tone]} />
          <div>
            <p
              className={cn(tone === "late" && "text-down")}
              title={
                freshness.lastSuccessAt === null
                  ? undefined
                  : ageHint(freshness.lastSuccessAt, now)
              }
            >
              {headline}
            </p>
            <p
              className="text-xs text-muted-foreground"
              title={next.kind === "at" ? timeZoneHint(next.at) : undefined}
            >
              {describeNextRun(next, now)}
            </p>
          </div>
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Dernière collecte">
          {last ? (
            <>
              <Time at={last.finishedAt} now={now} format="when" />,{" "}
              {last.manual ? "manuelle" : "automatique"}
            </>
          ) : (
            "Aucune"
          )}
        </Fact>
        <Fact label="Échecs de suite">
          <span className={cn(freshness.failures >= 2 && "text-down")}>
            {freshness.failures === 0 ? "Aucun" : freshness.failures}
          </span>
        </Fact>
        <Fact label="Import NetBox">
          {netbox === null ? (
            "NetBox inactif"
          ) : netbox.importedAt === null ? (
            "Jamais"
          ) : (
            <Time at={netbox.importedAt} now={now} format="age" />
          )}
        </Fact>
        <Fact label="Switches">
          {switchTotal === 0 ? (
            "Aucun"
          ) : (
            <span className="flex flex-wrap gap-x-3">
              <Count dot="bg-up" n={switches.up} label="en ligne" />
              <Count dot="bg-down" n={switches.down} label="hors ligne" />
              <Count
                dot="bg-muted-foreground"
                n={switches.unknown}
                label={switches.unknown > 1 ? "inconnus" : "inconnu"}
              />
            </span>
          )}
        </Fact>
      </dl>

      {site.ignoringCertificates.length > 0 ? (
        <p className="rounded-lg border border-down bg-down-background p-3 text-sm">
          {certificateWarning(site.ignoringCertificates)}
        </p>
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
                  <span className="text-muted-foreground">
                    {" "}
                    · {step.message}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {polled && polled.length > 0 ? <PolledSwitches polled={polled} /> : null}

      {netbox?.push ? <PushHealth push={netbox.push} now={now} /> : null}
    </li>
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

// A note is a phrase written to follow the switch's name in the step's text.
const sentence = (phrase: string) =>
  phrase.charAt(0).toUpperCase() + phrase.slice(1);

type Polled = NonNullable<
  NonNullable<SiteHealth["last"]>["steps"][number]["switches"]
>;

/** Each polled switch's result in the last LibreNMS read, failures first. */
function PolledSwitches({ polled }: { polled: Polled }) {
  const failed = polled.filter((entry) => !entry.ok).length;
  const ordered = polled.toSorted((a, b) => Number(a.ok) - Number(b.ok));
  return (
    // A failing switch keeps the list open; a healthy site folds it away.
    <details open={failed > 0} className="text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {polled.length} {polled.length > 1 ? "switches lus" : "switch lu"} dans
        LibreNMS
        {failed > 0 ? `, ${failed} en échec` : ""}
      </summary>
      <ul className="mt-2 divide-y rounded-lg border">
        {ordered.map((entry, index) => (
          <li
            key={`${entry.name}-${index}`}
            className="flex items-baseline gap-2 px-3 py-2"
          >
            <Dot className={entry.ok ? "bg-up" : "bg-down"} />
            <span className="font-medium">{entry.name}</span>
            {entry.notes.length > 0 ? (
              <span className="text-muted-foreground">
                {entry.notes.map(sentence).join(" ")}
              </span>
            ) : (
              <span className="text-muted-foreground">Lu</span>
            )}
          </li>
        ))}
      </ul>
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
        <span>
          <span className="font-medium">Envoi vers NetBox</span>
          <span className="text-muted-foreground">
            {" "}
            ·{" "}
            {last === null ? (
              "aucun envoi depuis qu'il est activé"
            ) : (
              <>
                <Time at={last.finishedAt} now={now} format="age" /> :{" "}
                {describePush(last)}
              </>
            )}
          </span>
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
                <Time at={entry.failingSince} now={now} format="when" />, nouvel
                essai après <Time at={entry.retryAt} now={now} format="when" />
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
