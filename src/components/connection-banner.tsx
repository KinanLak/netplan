import { useConvex } from "convex/react";
import { useEffect, useState } from "react";
import { useCanEdit } from "@/hooks/use-current-user";
import { advanceClock, isUp, offlineLine } from "@/lib/connection";
import type { ConnectionClock } from "@/lib/connection";
import { useMapDocumentSyncStatus } from "@/map-session/useMapDocument";
import { useStructureDialog } from "@/buildings/useStructureDialog";
import { useConnectionStore } from "@/store/useConnectionStore";
import { useMapStore } from "@/store/useMapStore";

/** Convex's socket and the browser's network, as the shell follows them. */
function useConnectionClock() {
  const convex = useConvex();
  // `since` restarts when the connection goes up or down; `now` moves on
  // when the offline line is due to change.
  const [clock, setClock] = useState<ConnectionClock>(() => {
    const opened = Date.now();
    return {
      state: convex.connectionState(),
      // The server has a network.
      online: typeof navigator === "undefined" || navigator.onLine,
      since: opened,
      now: opened,
    };
  });

  useEffect(
    () =>
      convex.subscribeToConnectionState((state) => {
        setClock((current) => advanceClock(current, { state }, Date.now()));
      }),
    [convex],
  );

  useEffect(() => {
    const onNetwork = () =>
      setClock((current) =>
        advanceClock(current, { online: navigator.onLine }, Date.now()),
      );
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    return () => {
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
    };
  }, []);

  return [clock, setClock] as const;
}

const plural = (count: number) =>
  count === 1
    ? "1 modification en attente"
    : `${count} modifications en attente`;

/**
 * Freezes the map the moment the connection drops, and says so in one
 * discreet line once it has stayed down (ADR 0037). Mounted once, inside the
 * map session whose unconfirmed edits it counts.
 */
export function ConnectionBanner() {
  const [clock, setClock] = useConnectionClock();
  const { pendingCount } = useMapDocumentSyncStatus();
  const canEdit = useCanEdit();
  const frozen = !isUp(clock);
  const { shown, changesIn } = offlineLine(clock);

  useEffect(() => {
    if (changesIn === null) return;
    const timer = window.setTimeout(
      () => setClock((current) => ({ ...current, now: Date.now() })),
      changesIn,
    );
    return () => window.clearTimeout(timer);
  }, [changesIn, setClock]);

  useEffect(() => {
    useConnectionStore.setState({ isOffline: frozen, isMapFrozen: shown });
  }, [frozen, shown]);

  // A tool or a multi-selection left on would block plain navigation, so
  // they close as they do when an Éditeur becomes a Lecteur; edit mode
  // itself resumes on reconnection. Only once the drop has lasted: a socket
  // that reconnects at once must not throw away a cable being drawn or a
  // name being typed, and changes are refused meanwhile anyway.
  useEffect(() => {
    if (!shown) return;
    useMapStore.getState().leaveEditTools();
    useStructureDialog.getState().close();
  }, [shown]);

  if (!shown) return null;

  const parts = [
    "Hors connexion",
    canEdit ? "lecture seule" : null,
    // Edits sent before the drop, confirmed or rolled back on its return.
    pendingCount > 0 ? plural(pendingCount) : null,
  ].filter(Boolean);

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border bg-card px-3 py-1.5 text-xs text-card-foreground shadow-md"
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-down" />
      <span className="text-pretty">{parts.join(" · ")}</span>
    </div>
  );
}
