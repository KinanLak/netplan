import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FloorId } from "@/types/map";
import { colorForHue, useIdentity } from "@/lib/identity";
import { api } from "../../convex/_generated/api";

const ONLINE_HEARTBEAT_MS = 10_000;
const ONLINE_STALE_AFTER_MS = 30_000;
const STALE_TICK_MS = 5_000;
const MAX_VISIBLE_USERS = 5;

interface ConnectedUsersProps {
  floorId: FloorId | null;
}

const initialsForName = (displayName: string): string => {
  const parts = displayName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
};

const pluralizeUsers = (count: number) =>
  count > 1 ? `${count} connectés` : `${count} connecté`;

export function ConnectedUsers({ floorId }: ConnectedUsersProps) {
  const identity = useIdentity();
  const updateOnlineUser = useMutation(api.presences.updateOnlineUser);
  const removePresence = useMutation(api.presences.remove);
  const [now, setNow] = useState(() => Date.now());
  const presences =
    useQuery(api.presences.listForFloor, floorId ? { floorId } : "skip") ?? [];

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
    const interval = window.setInterval(publish, ONLINE_HEARTBEAT_MS);
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

  if (!identity || !floorId) return null;

  const cutoff = now - ONLINE_STALE_AFTER_MS;
  const activeByClient = new Map<
    string,
    {
      sessionId: string;
      clientId: string;
      displayName: string;
      colorHue: number;
      updatedAt: number;
    }
  >();

  for (const presence of presences) {
    if (presence.updatedAt < cutoff) continue;
    activeByClient.set(presence.clientId, presence);
  }

  const hasOtherUsers = Array.from(activeByClient.keys()).some(
    (clientId) => clientId !== identity.clientId,
  );

  if (!hasOtherUsers) return null;

  activeByClient.set(identity.clientId, {
    sessionId: identity.sessionId,
    clientId: identity.clientId,
    displayName: identity.displayName,
    colorHue: identity.colorHue,
    updatedAt: now,
  });

  const users = Array.from(activeByClient.values()).toSorted((a, b) => {
    if (a.clientId === identity.clientId) return -1;
    if (b.clientId === identity.clientId) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
  const visibleUsers = users.slice(0, MAX_VISIBLE_USERS);
  const hiddenCount = users.length - visibleUsers.length;

  return (
    <div className="border-t px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-sidebar-foreground">
            En ligne
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {pluralizeUsers(users.length)} sur cet étage
          </div>
        </div>

        <div className="flex min-w-0 flex-row-reverse items-center justify-end pl-2">
          {hiddenCount > 0 ? (
            <div
              className="-ml-2 flex size-8 items-center justify-center rounded-full border-2 border-sidebar-border bg-muted text-[10px] font-semibold text-muted-foreground shadow-sm"
              title={`${hiddenCount} autre${hiddenCount > 1 ? "s" : ""}`}
            >
              +{hiddenCount}
            </div>
          ) : null}
          {visibleUsers.toReversed().map((user, index) => (
            <div
              key={user.clientId}
              className="-ml-2 flex size-8 items-center justify-center rounded-full border-2 border-sidebar-border text-[10px] font-bold tracking-wide text-white shadow-sm"
              style={{
                backgroundColor: colorForHue(user.colorHue, "label"),
                zIndex: index + 1,
              }}
              title={user.displayName}
              aria-label={user.displayName}
            >
              {initialsForName(user.displayName)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
