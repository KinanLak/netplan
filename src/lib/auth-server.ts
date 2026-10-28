import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";
import { getSessionCookie } from "better-auth/cookies";
import { checkHealth } from "@/lib/health";
import { readRuntimeConfig } from "@/lib/runtimeConfig";
import { readSessionToken } from "@/lib/session-token";

let helpers: ReturnType<typeof convexBetterAuthReactStart> | undefined;

// Built on first use, so the URLs are read from the server's environment at
// request time. CONVEX_SITE_URL is the Convex HTTP actions origin as this
// server reaches it, which can differ from what the backend reports itself
// as (ADR 0021).
const auth = () =>
  (helpers ??= convexBetterAuthReactStart(readRuntimeConfig(process.env)));

export const handler = (request: Request) => auth().handler(request);
/** The session's token, null without one; throws when Convex does not answer. */
export const getToken = () =>
  readSessionToken({
    getToken: () => auth().getToken(),
    // Imported when called, as the helper does: it only exists on the server.
    hasSessionCookie: async () => {
      const { getRequestHeaders } =
        await import("@tanstack/react-start/server");
      return getSessionCookie(getRequestHeaders()) !== null;
    },
    backendAnswers: async () =>
      (
        await checkHealth({
          env: process.env,
          fetch: (url, init) => fetch(url, init),
          timeoutMs: 3000,
        })
      ).status === "ok",
  });

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
