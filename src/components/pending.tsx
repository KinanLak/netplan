import type { ReactNode } from "react";
import { useConnectionStore } from "@/store/useConnectionStore";

/**
 * Where a page's data has not arrived yet: its usual placeholder, or, while
 * the shell says the connection is down, that the page waits for it. Convex
 * answers a new query only once connected, so a page first opened offline
 * would otherwise wait in silence (A43).
 */
export function Pending({ children = null }: { children?: ReactNode }) {
  const offline = useConnectionStore((state) => state.isMapFrozen);
  if (!offline) return children;
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed p-8 text-center text-sm"
    >
      <p className="font-medium">Pas de connexion</p>
    </div>
  );
}
