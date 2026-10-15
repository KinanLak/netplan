import type { AuthClient } from "@convex-dev/better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { genericOAuthClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Same origin: the app server proxies `/api/auth/*` to Convex.
export const authClient = createAuthClient({
  plugins: [usernameClient(), genericOAuthClient(), convexClient()],
});

// @convex-dev/better-auth 0.12 types this prop against the better-auth it was
// built with: under 1.6.33 its `useSession().data` resolves to `never`, so no
// real client matches. The provider only reads the session and token.
export const providerAuthClient = authClient as unknown as AuthClient;
