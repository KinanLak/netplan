import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

const provider = getAuthConfigProvider();

export default {
  providers: [
    // The backend fetches its own JWKS from its public URL to check every
    // token. AUTH_JWKS_URL replaces that address where the public URL does not
    // answer from inside the backend's container, as with dev:agent.
    process.env.AUTH_JWKS_URL
      ? { ...provider, jwks: process.env.AUTH_JWKS_URL }
      : provider,
  ],
} satisfies AuthConfig;
