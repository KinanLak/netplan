import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { polledSwitches } from "@/sites/librenms";
import { useSiteRefresh } from "@/sites/useSiteRefresh";
import type { SitePart } from "@/admin/SiteNav";
import { api } from "../../convex/_generated/api";

type Step = {
  label: string;
  done: boolean;
  /** The part of the page where it is done, the plan, or a refresh now. */
  where: SitePart | "plan" | "refresh";
};

const stepClass =
  "text-left text-primary underline-offset-4 hover:underline disabled:opacity-50";

const goTo = (part: SitePart) =>
  document
    .getElementById(part)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

/**
 * What a new site still needs, step by step (B24). It shows while the site
 * has no building, or while a connected site is not collecting yet; a plan
 * drawn by hand needs no integration.
 */
export function SiteSetupSteps({
  siteId,
  buildingCount,
}: {
  siteId: string;
  buildingCount: number;
}) {
  const integrations = useQuery(api.integrations.listForSite, { siteId });
  const netbox = useQuery(api.netbox.settings, { siteId });
  const librenms = useQuery(api.librenms.settings, { siteId });
  const freshness = useQuery(api.collection.freshness, { siteId });
  const refresh = useSiteRefresh(siteId);
  if (
    integrations === undefined ||
    netbox === undefined ||
    librenms === undefined ||
    freshness === undefined
  ) {
    return null;
  }

  const connected = integrations.length > 0;
  const steps: Array<Step> = [
    {
      label: "Créer un bâtiment sur le plan",
      done: buildingCount > 0,
      where: "plan",
    },
    {
      label: "Connecter NetBox ou LibreNMS",
      done: integrations.some((row) => row.lastCheck?.ok === true),
      where: "integrations",
    },
  ];
  if (netbox) {
    steps.push({
      label: "Choisir le site NetBox et les rôles à importer",
      done: netbox.site !== null && netbox.roles.length > 0,
      where: "correspondances",
    });
  }
  if (librenms) {
    steps.push({
      label: "Associer les switchs à leur équipement LibreNMS",
      done: polledSwitches(librenms.settings).length > 0,
      where: "correspondances",
    });
  }
  if (connected) {
    // Pressed, it starts the cycle; without « Actualiser » on this site, it
    // shows the collection to wait for.
    steps.push({
      label: refresh.offered
        ? "Lancer la première collecte"
        : "Attendre la première collecte",
      done: (freshness?.lastSuccessAt ?? null) !== null,
      where: refresh.offered ? "refresh" : "collections",
    });
  }

  const incomplete = steps.some((step) => !step.done);
  if (!incomplete || (buildingCount > 0 && !connected)) return null;

  return (
    <section
      aria-labelledby="setup-title"
      className="space-y-3 rounded-lg border p-4"
    >
      <h2 id="setup-title" className="font-medium">
        Mise en route
      </h2>
      <ol className="space-y-2 text-sm">
        {steps.map((step, index) => {
          const { where } = step;
          return (
            <li key={step.label} className="flex items-center gap-2">
              {step.done ? (
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  size={18}
                  strokeWidth={1.5}
                  className="shrink-0 text-up"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-[18px] shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground"
                >
                  {index + 1}
                </span>
              )}
              {/* An open step is its own way in. */}
              {step.done ? (
                <span className="text-muted-foreground">
                  {step.label}
                  <span className="sr-only"> (fait)</span>
                </span>
              ) : where === "plan" ? (
                <Link to="/" search={{ site: siteId }} className={stepClass}>
                  {step.label}
                </Link>
              ) : where === "refresh" ? (
                <button
                  type="button"
                  className={stepClass}
                  disabled={refresh.busy}
                  onClick={() => void refresh.start()}
                >
                  {step.label}
                </button>
              ) : (
                <button
                  type="button"
                  className={stepClass}
                  onClick={() => goTo(where)}
                >
                  {step.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
