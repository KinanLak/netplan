import { useQuery } from "convex/react";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { canEditMap } from "@/lib/roles";
import { api } from "../../convex/_generated/api";

export type CurrentUser = FunctionReturnType<typeof api.users.me>;

// One subscription for the whole signed-in app: every map node asks whether
// the user can edit, and each would otherwise hold its own query watch.
export const CurrentUserContext = createContext<CurrentUser | undefined>(
  undefined,
);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  return (
    <CurrentUserContext.Provider value={me}>
      {children}
    </CurrentUserContext.Provider>
  );
}

/** The signed-in user, or `undefined` while it loads. */
export function useCurrentUser(): CurrentUser | undefined {
  return useContext(CurrentUserContext);
}

/** False while the user loads, so a reader never sees edit controls flash. */
export function useCanEdit(): boolean {
  const me = useCurrentUser();
  return me ? canEditMap(me.role) : false;
}
