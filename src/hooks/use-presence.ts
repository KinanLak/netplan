import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FloorId } from "@/types/map";
import { useIdentity } from "@/lib/identity";
import { activePresences } from "@/lib/presence";
import type { ActivePresence } from "@/lib/presence";
import { api } from "../../convex/_generated/api";

const HEARTBEAT_MS = 2_000;
const STALE_TICK_MS = 1_000;

/**
 * Publishes the local user's presence for `floorId`, subscribes to every live
 * presence across the map, and returns them deduped by client with stale rows
 * dropped. Mount this once (the sidebar) so a single heartbeat runs per tab.
 */
export function usePresence(floorId: FloorId | null): Array<ActivePresence> {
  const identity = useIdentity();
  const updateOnlineUser = useMutation(api.presences.updateOnlineUser);
  const removePresence = useMutation(api.presences.remove);
  const [now, setNow] = useState(() => Date.now());
  const presences = useQuery(api.presences.list) ?? [];

  useEffect(() => {
    const interval = window.setInterval(
      () => setNow(Date.now()),
      STALE_TICK_MS,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!identity) return;
    if (!floorId) {
      void removePresence({ sessionId: identity.sessionId });
      return;
    }

    const publish = () => {
      void updateOnlineUser({
        sessionId: identity.sessionId,
        clientId: identity.clientId,
        displayName: identity.displayName,
        colorHue: identity.colorHue,
        floorId,
      });
    };

    publish();
    const interval = window.setInterval(publish, HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [floorId, identity, removePresence, updateOnlineUser]);

  useEffect(() => {
    if (!identity) return;
    const sessionId = identity.sessionId;
    const remove = () => {
      void removePresence({ sessionId });
    };

    window.addEventListener("pagehide", remove);
    return () => {
      window.removeEventListener("pagehide", remove);
      remove();
    };
  }, [identity, removePresence]);

  return activePresences(
    presences,
    identity
      ? {
          sessionId: identity.sessionId,
          clientId: identity.clientId,
          displayName: identity.displayName,
          colorHue: identity.colorHue,
          floorId,
        }
      : null,
    now,
  );
}
