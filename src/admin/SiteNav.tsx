import { useUnsavedPart } from "@/admin/unsaved";

/** The parts of a site's page, in order, each an anchor of the page. */
export const SITE_PARTS = [
  { id: "general", label: "Général" },
  { id: "integrations", label: "Intégrations" },
  { id: "correspondances", label: "Correspondances" },
  { id: "buildings", label: "Bâtiments" },
  { id: "collections", label: "Dernières collectes" },
  { id: "danger", label: "Suppression" },
] as const;

export type SitePart = (typeof SITE_PARTS)[number]["id"];

// Buttons rather than `#` links: a hash change is a navigation, which the
// unsaved-changes guard would stop.
const goTo = (part: SitePart) =>
  document
    .getElementById(part)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

/** A bar that stays above the page and marks parts with unsaved changes. */
export function SiteNav({
  parts,
}: {
  parts: ReadonlyArray<(typeof SITE_PARTS)[number]>;
}) {
  return (
    <nav
      aria-label="Sections du site"
      className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b bg-background px-4 py-2 md:-mx-8 md:px-8"
    >
      {parts.map((part) => (
        <NavItem key={part.id} id={part.id} label={part.label} />
      ))}
    </nav>
  );
}

function NavItem({ id, label }: { id: SitePart; label: string }) {
  const unsaved = useUnsavedPart(id);
  return (
    <button
      type="button"
      onClick={() => goTo(id)}
      className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {label}
      {unsaved ? (
        <>
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          <span className="sr-only">(modifications non enregistrées)</span>
        </>
      ) : null}
    </button>
  );
}
