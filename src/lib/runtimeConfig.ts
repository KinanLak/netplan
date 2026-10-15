/**
 * Configuration the app reads from its environment at request time, so one
 * built image serves every installation (ADR 0020). Never read these through
 * `import.meta.env`: a build would inline them.
 */
export interface RuntimeConfig {
  /** Convex client API, e.g. `https://convex.netplan.example`. */
  convexUrl: string;
  /** Convex HTTP actions, e.g. `https://convex-site.netplan.example`. */
  convexSiteUrl: string;
}

export type RuntimeEnv = Readonly<Record<string, string | undefined>>;

export class RuntimeConfigError extends Error {
  override name = "RuntimeConfigError";
}

export function readRuntimeConfig(env: RuntimeEnv): RuntimeConfig {
  return {
    convexUrl: readUrl(env, "CONVEX_URL"),
    convexSiteUrl: readUrl(env, "CONVEX_SITE_URL"),
  };
}

function readUrl(env: RuntimeEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new RuntimeConfigError(`${name} is not set.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RuntimeConfigError(`${name} is not a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RuntimeConfigError(`${name} must be an http or https URL.`);
  }
  return url.href.replace(/\/+$/, "");
}
