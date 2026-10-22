import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { polledSwitches } from "@/sites/librenms";
import type { SitePart } from "@/admin/SiteNav";
import { api } from "../../convex/_generated/api";

type Step = {
  label: string;
  done: boolean;
  /** The part of the page where it is done, or the plan. */
  where: SitePart | "plan";
};

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
      label: "Créer un bâtiment et ses étages sur le plan",
      done: buildingCount > 0,
      where: "plan",
    },
    {
      label: connected
        ? "Connecter NetBox ou LibreNMS"
        : "Connecter NetBox ou LibreNMS (facultatif pour un plan dessiné à la main)",
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
    steps.push({
      label: "Attendre ou lancer la première collecte",
      done: (freshness?.lastSuccessAt ?? null) !== null,
      where: "collections",
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
              <span className={step.done ? "text-muted-foreground" : undefined}>
                {step.label}
                {step.done ? <span className="sr-only"> (fait)</span> : null}
              </span>
              {step.done ? null : where === "plan" ? (
                <Link
                  to="/"
                  search={{ site: siteId }}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Ouvrir le plan
                </Link>
              ) : (
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => goTo(where)}
                >
                  Y aller
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
