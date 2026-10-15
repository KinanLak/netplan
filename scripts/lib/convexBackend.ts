// The self-hosted Convex backend used by `dev:agent` and by CI. CI's workflow
// repeats the image in its `services` block, which cannot import this file;
// `convexBackend.test.ts` keeps the two equal.
//
// The image has no semver tags: this is the commit tag of the newest
// precompiled release (precompiled-2026-10-10-72ce13c).
export const CONVEX_BACKEND_IMAGE =
  "ghcr.io/get-convex/convex-backend:72ce13c379fe6dbdfc305bc8ad699c5663c68c2a";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** True when `url` points at this machine, never at a shared deployment. */
export const isLoopbackUrl = (url: string): boolean => {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** True when a Convex backend answers at `url` within `timeoutMs`. */
export const backendAnswers = async (
  url: string,
  timeoutMs = 1500,
): Promise<boolean> => {
  try {
    const response = await fetch(new URL("/version", url), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
};
