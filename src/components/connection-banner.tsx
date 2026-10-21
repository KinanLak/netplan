import { useConvex } from "convex/react";
import { useEffect, useState } from "react";
import { useCanEdit } from "@/hooks/use-current-user";
import { useOnline } from "@/hooks/use-online";
import { connectionPhase } from "@/lib/connection";
import { cn } from "@/lib/utils";
import { useMapDocumentSyncStatus } from "@/map-session/useMapDocument";
import { useStructureDialog } from "@/buildings/useStructureDialog";
import { useConnectionStore } from "@/store/useConnectionStore";
import { useMapStore } from "@/store/useMapStore";

/** The connection to Convex as the shell presents it (ADR 0031). */
function useConnectionPhase() {
  const convex = useConvex();
  // `since` restarts at each change of the socket; `now` moves on when the
  // phase is due to change.
  const [clock, setClock] = useState(() => {
    const opened = Date.now();
    return { state: convex.connectionState(), since: opened, now: opened };
  });

  useEffect(
    () =>
      convex.subscribeToConnectionState((state) => {
        setClock((current) => {
          const now = Date.now();
          return state.isWebSocketConnected ===
            current.state.isWebSocketConnected
            ? { ...current, state, now }
            : { state, since: now, now };
        });
      }),
    [convex],
  );

  const { phase, changesIn } = connectionPhase({
    connected: clock.state.isWebSocketConnected,
    hasEverConnected: clock.state.hasEverConnected,
    since: clock.since,
    now: clock.now,
  });

  useEffect(() => {
    if (changesIn === null) return;
    const timer = window.setTimeout(
      () => setClock((current) => ({ ...current, now: Date.now() })),
      changesIn,
    );
    return () => window.clearTimeout(timer);
  }, [changesIn]);

  return phase;
}

const plural = (count: number) =>
  count === 1
    ? "1 modification en attente"
    : `${count} modifications en attente`;

/**
 * A discreet line at the bottom of every signed-in page while the server
 * cannot be reached. It also decides when the map freezes, so it is mounted
 * once, inside the map session whose queued edits it counts.
 */
export function ConnectionBanner() {
  const phase = useConnectionPhase();
  const { pendingCount } = useMapDocumentSyncStatus();
  const online = useOnline();
  const canEdit = useCanEdit();
  const shown = phase !== "connected";
  const frozen = phase === "frozen";

  useEffect(() => {
    useConnectionStore.setState({ isMapFrozen: frozen, isBannerShown: shown });
    // What was open when the grace ran out would still edit, and a tool or
    // a multi-selection left on would block plain navigation; they close as
    // they do when an Éditeur becomes a Lecteur. Edit mode itself is kept.
    if (frozen) {
      useMapStore.getState().leaveEditTools();
      useStructureDialog.getState().close();
    }
  }, [frozen, shown]);

  if (!shown) return null;

  const parts = [
    online ? "Serveur injoignable" : "Pas de connexion réseau",
    phase === "unreachable"
      ? "Nouvelle tentative en cours…"
      : !canEdit
        ? "Les données affichées peuvent ne plus être à jour."
        : frozen
          ? "Le plan est en lecture seule jusqu'au retour de la connexion."
          : "Vos modifications seront envoyées au retour de la connexion.",
    // The map's queued edits; Convex's own queue also holds presence
    // heartbeats, which are not the user's changes.
    pendingCount > 0 ? plural(pendingCount) : null,
  ].filter(Boolean);

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border bg-card px-3 py-1.5 text-xs text-card-foreground shadow-md"
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          frozen || phase === "unreachable" ? "bg-down" : "bg-unknown",
        )}
      />
      {/* Wraps on a narrow screen: the read-only notice and the count are
          what the line is for. */}
      <span className="text-pretty">{parts.join(" · ")}</span>
    </div>
  );
}
