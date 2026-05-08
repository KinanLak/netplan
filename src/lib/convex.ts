import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    "VITE_CONVEX_URL is not set. Run `bunx convex dev` to provision the deployment.",
  );
}

export const convexClient = new ConvexReactClient(convexUrl);
