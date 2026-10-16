import { ConvexReactClient } from "convex/react";

let client: ConvexReactClient | undefined;

/**
 * One client per page for the URL the server handed over. The client opens
 * its connection on first use, so creating it during SSR costs nothing.
 *
 * On a page loaded with a session, requests wait for the token: children
 * subscribe in their effects before the auth provider's effect hands it
 * over, and a query sent first fails as unauthenticated, which the session
 * boundary reads as a lost session. A page without one never gets a token,
 * so it must not wait. Signing in or out reloads the page, so the choice
 * holds for the client's life.
 *
 * Convex's own unload warning fires on any request in flight, the presence
 * heartbeat included, so signing out asked to leave the page; the map warns
 * only while its edits are unsaved (`MapDocumentProvider`).
 */
export function getConvexClient(
  url: string,
  { signedIn }: { signedIn: boolean },
): ConvexReactClient {
  if (client?.url !== url) {
    client = new ConvexReactClient(url, {
      expectAuth: signedIn,
      unsavedChangesWarning: false,
    });
  }
  return client;
}
