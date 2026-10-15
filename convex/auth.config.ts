import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

const provider = getAuthConfigProvider();

// The backend fetches its own JWKS from its public URL to check every token.
// AUTH_JWKS_URL replaces that address where the public URL does not answer from
// inside the backend's container, as with dev:agent. When the backend evaluates
// this file, reading an unset variable throws instead of giving undefined.
function readJwksUrl(): string | undefined {
  try {
    return process.env.AUTH_JWKS_URL;
  } catch {
    return undefined;
  }
}

const jwksUrl = readJwksUrl();

export default {
  providers: [jwksUrl ? { ...provider, jwks: jwksUrl } : provider],
} satisfies AuthConfig;
