import { useNavigate } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentSite } from "@/sites/useCurrentSite";
import type { SiteSummary } from "@/sites/useCurrentSite";

const labelOf = (site: SiteSummary) =>
  site.archived ? `${site.name} (archivé)` : site.name;

/**
 * The site the page shows; a list only when there is more than one. Archived
 * sites stay out of it, unless the page shows one (ADR 0033).
 */
export function SiteSwitcher() {
  const { sites, site } = useCurrentSite();
  const navigate = useNavigate();
  if (!sites || !site) return null;
  const choices = sites.filter(
    (other) => !other.archived || other.id === site.id,
  );

  if (choices.length === 1) {
    return (
      <div className="truncate px-2 text-sm font-medium" title={labelOf(site)}>
        {site.name}
        {site.archived ? (
          <span className="font-normal text-muted-foreground"> (archivé)</span>
        ) : null}
      </div>
    );
  }

  return (
    <Select
      items={choices.map((choice) => ({
        value: choice.id,
        label: labelOf(choice),
      }))}
      value={site.id}
      onValueChange={(siteId) => {
        if (siteId) void navigate({ to: ".", search: { site: siteId } });
      }}
    >
      <SelectTrigger aria-label="Site" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.id} value={choice.id}>
            {labelOf(choice)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
