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
import {
  describeAge,
  describeNextRun,
  isLate,
  nextRun,
} from "@/sites/freshness";
import { useSiteRefresh } from "@/sites/useSiteRefresh";

/** Only where a `ShortcutIntentProvider` listens: the map. */
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

  const { timezone, lastSuccessAt } = freshness;
  const late = isLate(freshness, now);
  const age =
    lastSuccessAt === null ? null : describeAge(lastSuccessAt, now, timezone);
  const headline = !freshness.hasSources
    ? "Plan dessiné à la main"
    : age === null
      ? "Aucune donnée collectée"
      : late
        ? `Données en retard : ${age}`
        : `Données collectées ${age}`;

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          late
            ? "bg-down"
            : !freshness.hasSources || age === null
              ? "bg-muted-foreground"
              : "bg-up",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-pretty", late && "text-down")}>{headline}</p>
        <p className="text-xs text-pretty text-muted-foreground">
          {describeNextRun(nextRun(freshness, now), now, timezone)}
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
