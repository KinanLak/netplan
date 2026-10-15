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

export async function checkHealth(deps: HealthDeps): Promise<HealthReport> {
  const checks: Array<HealthCheck> = [];
  let convexUrl: string | undefined;
  try {
    convexUrl = readRuntimeConfig(deps.env).convexUrl;
    checks.push({ name: "config", status: "ok" });
  } catch (error) {
    checks.push({ name: "config", status: "ko", detail: describe(error) });
  }
  if (convexUrl !== undefined) {
    checks.push(await checkConvex(deps, convexUrl));
  }
  return {
    status: checks.every((check) => check.status === "ok") ? "ok" : "ko",
    checks,
  };
}

async function checkConvex(
  deps: HealthDeps,
  convexUrl: string,
): Promise<HealthCheck> {
  try {
    const response = await deps.fetch(`${convexUrl}/version`, {
      signal: AbortSignal.timeout(deps.timeoutMs),
    });
    if (!response.ok) {
      return {
        name: "convex",
        status: "ko",
        detail: `backend answered ${response.status}`,
      };
    }
    return { name: "convex", status: "ok" };
  } catch (error) {
    return { name: "convex", status: "ko", detail: describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
