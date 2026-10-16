import { useNavigate } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentSite } from "@/sites/useCurrentSite";

/** The site the page shows; a list only when there is more than one. */
export function SiteSwitcher() {
  const { sites, site } = useCurrentSite();
  const navigate = useNavigate();
  if (!sites || !site) return null;

  if (sites.length === 1) {
    return (
      <div className="truncate px-2 text-sm font-medium" title={site.name}>
        {site.name}
      </div>
    );
  }

  return (
    <Select
      items={sites.map(({ id, name }) => ({ value: id, label: name }))}
      value={site.id}
      onValueChange={(siteId) => {
        if (siteId) void navigate({ to: ".", search: { site: siteId } });
      }}
    >
      <SelectTrigger aria-label="Site" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {sites.map(({ id, name }) => (
          <SelectItem key={id} value={id}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
