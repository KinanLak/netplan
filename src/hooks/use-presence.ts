import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FloorId } from "@/types/map";
import { useIdentity } from "@/lib/identity";
import { activePresences } from "@/lib/presence";
import type { ActivePresence } from "@/lib/presence";
import { useCurrentUser } from "@/hooks/use-current-user";
import { api } from "../../convex/_generated/api";
import { colorHueFor } from "../../convex/lib/presence";

const HEARTBEAT_MS = 2_000;
const STALE_TICK_MS = 1_000;

/**
 * Publishes this page's presence for `floorId`, subscribes to every live
 * presence across the map, and returns one entry per user with stale rows
 * dropped. Mount this once (the sidebar) so a single heartbeat runs per tab.
 */
export function usePresence(floorId: FloorId | null): Array<ActivePresence> {
  const identity = useIdentity();
  const me = useCurrentUser();
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
    const clientId = identity.clientId;
    if (!floorId) {
      void removePresence({ clientId });
      return;
    }

    // Coming back to the page tells the server at once that this is where the
    // user is now, so their avatar follows them across tabs and devices in
    // the order they switched, not in the order their heartbeats fire.
    const publish = (active: boolean) => {
      void updateOnlineUser({ clientId, floorId, active });
    };
    const markActive = () => {
      if (document.visibilityState === "visible") publish(true);
    };

    publish(true);
    const interval = window.setInterval(() => publish(false), HEARTBEAT_MS);
    window.addEventListener("focus", markActive);
    document.addEventListener("visibilitychange", markActive);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", markActive);
      document.removeEventListener("visibilitychange", markActive);
    };
  }, [floorId, identity, removePresence, updateOnlineUser]);

  useEffect(() => {
    if (!identity) return;
    const clientId = identity.clientId;
    const remove = () => {
      void removePresence({ clientId });
    };

    window.addEventListener("pagehide", remove);
    return () => {
      window.removeEventListener("pagehide", remove);
      remove();
    };
  }, [identity, removePresence]);

  return activePresences(
    presences,
    identity && me
      ? {
          clientId: identity.clientId,
          userId: me.id,
          displayName: me.name,
          colorHue: colorHueFor(me.id),
          floorId,
        }
      : null,
    now,
  );
}
