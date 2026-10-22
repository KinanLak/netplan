import { useQuery } from "convex/react";
import { useSearch } from "@tanstack/react-router";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useCanEdit } from "@/hooks/use-current-user";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

export type SiteSummary = FunctionReturnType<typeof api.sites.list>[number];

/** The map's search: the site, and the floor and device it opens on. */
export const mapSearch = (
  search: Record<string, unknown>,
): { site?: string; floor?: string; device?: string } => ({
  ...siteSearch(search),
  ...(typeof search.floor === "string" ? { floor: search.floor } : {}),
  ...(typeof search.device === "string" ? { device: search.device } : {}),
});

/** The `site` search parameter of the map and the inventory, read loosely. */
export const siteSearch = (
  search: Record<string, unknown>,
): { site?: string } =>
  typeof search.site === "string" ? { site: search.site } : {};

/**
 * The site the page shows: the one the URL names, else the first open one by
 * name. An archived site opens only by its link (ADR 0033). `site` is
 * `undefined` while the sites load and `null` when there is none.
 */
export function useCurrentSite(): {
  sites: Array<SiteSummary> | undefined;
  site: SiteSummary | null | undefined;
} {
  const { site: requested } = useSearch({ strict: false });
  const sites = useQuery(api.sites.list);
  if (sites === undefined) return { sites, site: undefined };
  return {
    sites,
    site:
      sites.find((site) => site.id === requested) ??
      sites.find((site) => !site.archived) ??
      null,
  };
}

/**
 * Whether the site the page shows is archived: read only then, as for a
 * Lecteur (ADR 0033). A context, so components render without a router in
 * tests; `CurrentSiteArchived` sets it for every signed-in page.
 */
export const SiteArchivedContext = createContext(false);

export function CurrentSiteArchived({ children }: { children: ReactNode }) {
  const { site } = useCurrentSite();
  return (
    <SiteArchivedContext value={site?.archived === true}>
      {children}
    </SiteArchivedContext>
  );
}

/** Whether the user may change the site the page shows: role and archive. */
export function useCanEditSite(): boolean {
  const canEdit = useCanEdit();
  const archived = useContext(SiteArchivedContext);
  return canEdit && !archived;
}
