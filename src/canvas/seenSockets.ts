import { createContext, use } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const NO_SOCKETS: ReadonlySet<string> = new Set();

/** The sockets of the floor where the network last saw a device (B13). */
export const SeenSocketsContext =
  createContext<ReadonlySet<string>>(NO_SOCKETS);

export const useFloorSeenSockets = (floorId: string): ReadonlySet<string> => {
  const seen = useQuery(api.mapDocument.getFloorSeenSockets, { floorId });
  return seen ? new Set(seen) : NO_SOCKETS;
};

export const useIsSocketSeen = (socketId: string): boolean =>
  use(SeenSocketsContext).has(socketId);
