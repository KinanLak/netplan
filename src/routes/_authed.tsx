import type { ReactNode } from "react";
import { AuthBoundary } from "@convex-dev/better-auth/react";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { CurrentUserProvider } from "@/hooks/use-current-user";
import { MapDocumentProvider } from "@/map-session/MapDocumentProvider";
import { useCurrentFloorId } from "@/store/selectors";
import { providerAuthClient } from "@/lib/auth-client";
import { isSessionLost } from "@/lib/login";
import { api } from "../../convex/_generated/api";

// Every page except the login page needs a session (ADR 0003).
export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (!context.token) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: AuthedLayout,
});

// A session can end while the page is open: expiry, sign-out in another tab,
// a disabled account. The Convex token outlives it, so functions start
// refusing and the boundary sends the user to the login page. A full load,
// so the server reads the cleared cookie.
const backToLogin = () => {
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams({ redirect: pathname + search + hash });
  window.location.assign(`/login?${params.toString()}`);
};

function AuthedLayout() {
  return (
    <AuthBoundary
      authClient={providerAuthClient}
      getAuthUserFn={api.users.me}
      isAuthError={isSessionLost}
      onUnauth={backToLogin}
    >
      <CurrentUserProvider>
        <MapSession>
          <Outlet />
        </MapSession>
      </CurrentUserProvider>
    </AuthBoundary>
  );
}

// The map session outlives the map page: it holds the outbox of unsent edits
// and each floor's undo history, which a trip to the inventory or the admin,
// or another site or building loading, must not drop.
function MapSession({ children }: { children: ReactNode }) {
  const floorId = useCurrentFloorId();
  return (
    <MapDocumentProvider floorId={floorId}>{children}</MapDocumentProvider>
  );
}
