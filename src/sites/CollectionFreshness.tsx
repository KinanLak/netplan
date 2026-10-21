import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { useNow } from "@/hooks/use-now";
import { isAdmin } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { describeFreshness, describeNextRun, nextRun } from "@/sites/freshness";
import type { FreshnessTone } from "@/sites/freshness";
import { useSiteRefresh } from "@/sites/useSiteRefresh";

export const FRESHNESS_DOT: Record<FreshnessTone, string> = {
  fresh: "bg-up",
  late: "bg-down",
  none: "bg-muted-foreground",
};

/** Only on the map, which asks for it with `withShortcut`. */
function RefreshShortcut({ run }: { run: () => void }) {
  useShortcutIntentEffect("refresh-site", run);
  return null;
}

/**
 * How fresh the site's data is and when it is next collected, with
 * "Actualiser" for Éditeurs and Admins (ADR 0026). The same block on the map
 * and in the inventory.
 */
export function CollectionFreshness({
  siteId,
  withShortcut = false,
  linkToSettings = true,
  className,
}: {
  siteId: string;
  /** Admins get a link to the site's integrations when it has none. */
  linkToSettings?: boolean;
  /** The page listens to the shortcut, so the button shows its hint. */
  withShortcut?: boolean;
  className?: string;
}) {
  const { freshness, offered, busy, start } = useSiteRefresh(siteId);
  const now = useNow(30_000);
  const me = useCurrentUser();
  if (!freshness) return null;

  const { headline, tone } = describeFreshness(freshness, now);
  const late = tone === "late";

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", FRESHNESS_DOT[tone])}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-pretty", late && "text-down")}>{headline}</p>
        <p className="text-xs text-pretty text-muted-foreground">
          {describeNextRun(nextRun(freshness, now), now, freshness.timezone)}
          {!freshness.hasSources && linkToSettings && me && isAdmin(me.role) ? (
            <>
              {" · "}
              <Link
                to="/admin/sites/$siteId"
                params={{ siteId }}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Configurer
              </Link>
            </>
          ) : null}
        </p>
      </div>
      {offered && withShortcut ? (
        <RefreshShortcut run={() => void start()} />
      ) : null}
      {offered && withShortcut ? (
        <ShortcutHint action="refresh-site" size="sm" />
      ) : null}
      {offered ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={busy || freshness.paused}
          onClick={() => void start()}
          aria-label="Actualiser les données"
          title={busy ? "Collecte en cours…" : "Actualiser les données"}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            size={16}
            strokeWidth={1.5}
            className={cn(busy && "animate-spin")}
          />
        </Button>
      ) : null}
    </div>
  );
}
