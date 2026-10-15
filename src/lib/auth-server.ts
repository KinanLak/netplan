import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";
import { readRuntimeConfig } from "@/lib/runtimeConfig";

let helpers: ReturnType<typeof convexBetterAuthReactStart> | undefined;

// Built on first use, so the URLs are read from the server's environment at
// request time. CONVEX_SITE_URL is the Convex HTTP actions origin as this
// server reaches it, which can differ from what the backend reports itself
// as (ADR 0021).
const auth = () =>
  (helpers ??= convexBetterAuthReactStart(readRuntimeConfig(process.env)));

export const handler = (request: Request) => auth().handler(request);
export const getToken = () => auth().getToken();

/**
 * The sign-in methods the login page offers. Asked server-side, where
 * CONVEX_SITE_URL is reachable; an unreachable backend offers the password
 * form alone, which then shows the failure.
 */
export async function getSignInOptions(): Promise<{ keycloak: boolean }> {
  try {
    const { convexSiteUrl } = readRuntimeConfig(process.env);
    const response = await fetch(`${convexSiteUrl}/api/auth/sign-in-options`, {
      signal: AbortSignal.timeout(3000),
    });
    const options = (await response.json()) as { keycloak?: unknown };
    return { keycloak: response.ok && options.keycloak === true };
  } catch {
    return { keycloak: false };
  }
}
