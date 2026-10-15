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
