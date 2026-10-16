import { useQuery } from "convex/react";
import { useSearch } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

export type SiteSummary = FunctionReturnType<typeof api.sites.list>[number];

/** The `site` search parameter of the map and the inventory, read loosely. */
export const siteSearch = (
  search: Record<string, unknown>,
): { site?: string } =>
  typeof search.site === "string" ? { site: search.site } : {};

/**
 * The site the page shows: the one the URL names, else the first by name.
 * `site` is `undefined` while the sites load and `null` when there is none.
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
    site: sites.find((site) => site.id === requested) ?? sites.at(0) ?? null,
  };
}
