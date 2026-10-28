import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const devices = (n: number) =>
  n === 0 ? "vide" : n === 1 ? "1 équipement" : `${n} équipements`;

/**
 * The site's buildings and floors, read only: they are drawn, renamed and
 * removed on the plan, where an Éditeur sees what each holds (A83).
 */
export function BuildingsSection({ siteId }: { siteId: string }) {
  const buildings = useQuery(api.sites.structure, { siteId });
  if (buildings === undefined) return null;
  return (
    <section
      id="buildings"
      className="scroll-mt-14 space-y-3 border-t pt-6"
      aria-labelledby="buildings-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="buildings-title" className="font-medium">
          Bâtiments
        </h2>
        <Link
          to="/"
          search={{ site: siteId }}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {buildings.length === 0
            ? "Créer un bâtiment sur le plan"
            : "Ouvrir sur le plan"}
        </Link>
      </div>
      {buildings.length === 0 ? null : (
        <ul className="divide-y rounded-lg border text-sm">
          {buildings.map((building) => (
            <li key={building.id} className="space-y-1 px-4 py-3">
              <p className="font-medium">{building.name}</p>
              {building.floors.length > 0 ? (
                <p className="text-muted-foreground">
                  {building.floors
                    .map((floor) => `${floor.name} (${devices(floor.devices)})`)
                    .join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
