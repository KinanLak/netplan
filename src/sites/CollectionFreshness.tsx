import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { useNow } from "@/hooks/use-now";
import { isAdmin } from "@/lib/roles";
import { ageHint, formatWhen, timeZoneHint } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  describeFreshness,
  describeNextRun,
  describeSources,
  failedAttemptAt,
  nextRun,
} from "@/sites/freshness";
import type { FreshnessTone } from "@/sites/freshness";
import { usePendingRefreshes, useSiteRefresh } from "@/sites/useSiteRefresh";

export const FRESHNESS_DOT: Record<FreshnessTone, string> = {
  fresh: "bg-up",
  late: "bg-down",
  none: "bg-muted-foreground",
};

/**
 * Shift+R on the map. Mounted by the map itself, not the sidebar, which
 * unmounts while folded on a small screen.
 */
export function SiteRefreshShortcut({ siteId }: { siteId: string }) {
  const { offered, start } = useSiteRefresh(siteId);
  useShortcutIntentEffect("refresh-site", () => void start(), {
    enabled: offered,
  });
  return null;
}

/**
 * "Actualiser" for Éditeurs and Admins (ADR 0026). A success shows as a
 * check mark on the button rather than a toast: the freshness line already
 * says the data is new.
 */
export function SiteRefreshButton({
  siteId,
  withShortcut = false,
}: {
  siteId: string;
  /** The page listens to Shift+R, so the button shows its hint. */
  withShortcut?: boolean;
}) {
  const { freshness, offered, busy, start } = useSiteRefresh(siteId);
  const justSucceeded = usePendingRefreshes((state) =>
    Object.hasOwn(state.succeeded, siteId),
  );
  if (!offered) return null;
  const succeeded = justSucceeded && !busy;

  return (
    <span className="flex shrink-0 items-center gap-1">
      {withShortcut ? <ShortcutHint action="refresh-site" size="sm" /> : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={busy || freshness?.paused}
        onClick={() => void start()}
        aria-label={
          succeeded ? "Données actualisées" : "Actualiser les données"
        }
        title={
          busy
            ? "Collecte en cours…"
            : succeeded
              ? "Données actualisées"
              : "Actualiser les données"
        }
      >
        <HugeiconsIcon
          icon={succeeded ? Tick02Icon : RefreshIcon}
          size={16}
          strokeWidth={1.5}
          className={cn(
            busy && "animate-spin",
            succeeded && "text-up animate-in zoom-in-50",
          )}
        />
      </Button>
    </span>
  );
}

/**
 * How fresh the site's data is and when it is next collected, with each
 * source's own age on hover. The same block on the map, in the inventory and
 * in the site's admin page; the map puts "Actualiser" on the site's line.
 */
export function CollectionFreshness({
  siteId,
  withShortcut = false,
  withRefresh = true,
  linkToSettings = true,
  className,
}: {
  siteId: string;
  /** Admins get a link to the site's integrations when it has none. */
  linkToSettings?: boolean;
  /** The page listens to Shift+R, so the button shows its hint. */
  withShortcut?: boolean;
  /** Whether "Actualiser" sits at the end of the block. */
  withRefresh?: boolean;
  className?: string;
}) {
  const { freshness } = useSiteRefresh(siteId);
  const now = useNow(30_000);
  const me = useCurrentUser();
  if (!freshness) return null;

  const { headline, tone } = describeFreshness(freshness, now);
  const late = tone === "late";
  const failedAt = failedAttemptAt(freshness);
  const next = nextRun(freshness, now);
  const sources = describeSources(freshness, now);
  const admin = Boolean(me && isAdmin(me.role));

  // The hover card names each source's age; without one, the hint does.
  const headlineText = (
    <span
      className={cn("text-pretty", late && "text-down")}
      title={
        sources.length === 0 && freshness.lastSuccessAt !== null
          ? ageHint(freshness.lastSuccessAt, now)
          : undefined
      }
    >
      {headline}
    </span>
  );

  return (
    <div className={cn("flex items-start gap-2 text-sm", className)}>
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          FRESHNESS_DOT[tone],
        )}
      />
      <div className="min-w-0 flex-1">
        {sources.length > 0 ? (
          <Popover>
            <PopoverTrigger
              openOnHover
              delay={150}
              className="cursor-default rounded-sm text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              {headlineText}
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              className="w-64 gap-2 p-3 text-xs"
            >
              <ul className="space-y-1.5">
                {sources.map((line) => (
                  <li key={line.label}>
                    <span className="font-medium">{line.label}</span>
                    <span
                      className={cn(
                        "block",
                        line.failed ? "text-down" : "text-muted-foreground",
                      )}
                    >
                      {line.detail}
                    </span>
                  </li>
                ))}
              </ul>
              {/* Ages turn into dates after a day: say whose clock. */}
              <p className="text-muted-foreground">{timeZoneHint(now)}</p>
              {admin ? (
                <Link
                  to="/admin/health"
                  className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Voir la santé de la collecte
                </Link>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : (
          <p>{headlineText}</p>
        )}
        <p
          className={cn(
            "text-xs text-pretty",
            failedAt === null ? "text-muted-foreground" : "text-down",
          )}
        >
          <span
            title={
              failedAt !== null
                ? timeZoneHint(failedAt)
                : next.kind === "at"
                  ? timeZoneHint(next.at)
                  : undefined
            }
          >
            {failedAt === null
              ? describeNextRun(next, now)
              : `Dernière tentative en échec à ${formatWhen(failedAt, now)}`}
          </span>
          {!freshness.hasSources && linkToSettings && admin ? (
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
      {withRefresh ? (
        <SiteRefreshButton siteId={siteId} withShortcut={withShortcut} />
      ) : null}
    </div>
  );
}
