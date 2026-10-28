import { readRuntimeConfig } from "@/lib/runtimeConfig";
import type { RuntimeEnv } from "@/lib/runtimeConfig";

export type HealthStatus = "ok" | "ko";

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  detail?: string;
}

export interface HealthReport {
  status: HealthStatus;
  checks: Array<HealthCheck>;
}

export interface HealthDeps {
  env: RuntimeEnv;
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
  timeoutMs: number;
}

/**
 * What the app's server throws when it cannot read the session because
 * Convex does not answer. A message rather than a class: the error crosses
 * from the server to the browser, which only keeps its message.
 */
export const BACKEND_UNREACHABLE = "NetPlan: backend unreachable";

export async function checkHealth(deps: HealthDeps): Promise<HealthReport> {
  const checks: Array<HealthCheck> = [];
  let urls: { convexUrl: string; convexSiteUrl: string } | undefined;
  try {
    urls = readRuntimeConfig(deps.env);
    checks.push({ name: "config", status: "ok" });
  } catch (error) {
    checks.push({ name: "config", status: "ko", detail: describe(error) });
  }
  if (urls !== undefined) {
    checks.push(
      ...(await Promise.all([
        checkUrl(deps, "convex", `${urls.convexUrl}/version`),
        // Where this server reads sessions, which can differ (ADR 0021).
        checkUrl(deps, "convex-site", `${urls.convexSiteUrl}/api/auth/ok`),
      ])),
    );
  }
  return {
    status: checks.every((check) => check.status === "ok") ? "ok" : "ko",
    checks,
  };
}

async function checkUrl(
  deps: HealthDeps,
  name: string,
  url: string,
): Promise<HealthCheck> {
  try {
    const response = await deps.fetch(url, {
      signal: AbortSignal.timeout(deps.timeoutMs),
    });
    if (!response.ok) {
      return {
        name,
        status: "ko",
        detail: `backend answered ${response.status}`,
      };
    }
    return { name, status: "ok" };
  } catch (error) {
    return { name, status: "ko", detail: describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
