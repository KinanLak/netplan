// Pure parts of `scripts/dev-agent.ts`, kept apart so they can be tested
// without Docker.
import { basename } from "node:path";

export const GENERATED_ENV_HEADER =
  "# Written by `bun run dev:agent`; delete to regenerate.";

/** Labels on every container, volume and network `dev:agent` creates. */
export const ROLE_LABEL = "netplan.role=dev-backend";
export const WORKTREE_LABEL = "netplan.worktree";
export const OWNER_LABEL = "netplan.owner";

// Chrome refuses to load these; 3659 is the only one in the web port range.
const BROWSER_BLOCKED_PORTS = new Set([3659]);

const digest = (worktree: string): string =>
  new Bun.CryptoHasher("sha256").update(worktree).digest("hex");

/**
 * Docker name of the worktree's container and volume: readable, and unique
 * per path even when two worktrees share a directory name.
 */
export const resourceName = (worktree: string): string => {
  const slug =
    basename(worktree)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "worktree";
  return `netplan-cvx-${slug}-${digest(worktree).slice(0, 6)}`;
};

/** Mailpit, as the `local` compose profile runs it. */
export const MAILPIT_IMAGE = "axllent/mailpit:v1.31.6";

const MAIL_SUFFIX = "-mail";

/** The worktree's Mailpit container, next to its backend. */
export const mailName = (backend: string): string => `${backend}${MAIL_SUFFIX}`;

/** The backend a `dev:agent` container, volume or network belongs to. */
export const backendOf = (resource: string): string =>
  resource.endsWith(MAIL_SUFFIX)
    ? resource.slice(0, -MAIL_SUFFIX.length)
    : resource;

/**
 * Where the worktree's ports start: a backend pair (API, then site) in
 * 13200-13999, a web port in 3100-3999 and Mailpit's inbox in 14000-14899.
 * The caller walks up from there while a port is taken, so the same worktree
 * usually gets the same ports.
 */
export const preferredPorts = (
  worktree: string,
): { backend: number; web: number; mail: number } => {
  const value = Number.parseInt(digest(worktree).slice(0, 8), 16);
  return {
    backend: 13200 + (value % 400) * 2,
    web: 3100 + (value % 900),
    mail: 14000 + (value % 900),
  };
};

export const nextWebPort = (
  start: number,
  isFree: (port: number) => boolean,
): number => {
  let port = start;
  while (BROWSER_BLOCKED_PORTS.has(port) || !isFree(port)) port += 1;
  return port;
};

export const nextBackendPorts = (
  start: number,
  isFree: (port: number) => boolean,
): number => {
  let port = start;
  while (!isFree(port) || !isFree(port + 1)) port += 2;
  return port;
};

export const isGeneratedEnvFile = (text: string): boolean =>
  text.startsWith(GENERATED_ENV_HEADER);

// Single-quoted, so a shell can load the file too (`set -a; . .env.local`):
// an admin key holds a `|`. Vite, Bun and the Convex CLI read it the same.
export const renderEnvFile = (values: Record<string, string>): string =>
  [
    GENERATED_ENV_HEADER,
    ...Object.entries(values).map(([name, value]) => {
      if (value.includes("'")) throw new Error(`${name} holds a quote`);
      return `${name}='${value}'`;
    }),
    "",
  ].join("\n");

/** `NAME=value` lines, as `convex env list` prints them or quoted. */
export const parseEnvLines = (text: string): Map<string, string> => {
  const values = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const quoted = /^'([^']*)'$/.exec(match[2]);
    values.set(match[1], quoted ? quoted[1] : match[2]);
  }
  return values;
};

/** Host port Docker publishes for a container port, from `HostConfig.PortBindings`. */
export const publishedPort = (
  bindings: Record<string, Array<{ HostPort?: string }> | null> | null,
  containerPort: number,
): number | undefined => {
  const hostPort = bindings?.[`${containerPort}/tcp`]?.[0]?.HostPort;
  return hostPort ? Number(hostPort) : undefined;
};

type SeedConnection = { url: string; token: string };

/**
 * What `--integrations` connects the demo site to, read from the variables
 * the caller exported, and the names it found missing.
 */
export const integrationSeedArgs = (
  env: Record<string, string | undefined>,
): {
  args: { netbox?: SeedConnection; librenms?: SeedConnection };
  missing: Array<string>;
} => {
  const args: { netbox?: SeedConnection; librenms?: SeedConnection } = {};
  const missing: Array<string> = [];
  for (const [kind, prefix] of [
    ["netbox", "NETBOX"],
    ["librenms", "LIBRENMS"],
  ] as const) {
    const url = env[`${prefix}_URL`]?.trim();
    const token = env[`${prefix}_TOKEN`]?.trim();
    if (url && token) args[kind] = { url, token };
    else {
      if (!url) missing.push(`${prefix}_URL`);
      if (!token) missing.push(`${prefix}_TOKEN`);
    }
  }
  return { args, missing };
};
