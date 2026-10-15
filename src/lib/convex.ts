import { ConvexReactClient } from "convex/react";

let client: ConvexReactClient | undefined;

/**
 * One client per page for the URL the server handed over. The client opens
 * its connection on first use, so creating it during SSR costs nothing.
 */
export function getConvexClient(url: string): ConvexReactClient {
  if (client?.url !== url) {
    client = new ConvexReactClient(url);
  }
  return client;
}
