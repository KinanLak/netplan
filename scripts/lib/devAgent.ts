// Pure parts of `scripts/dev-agent.ts`, kept apart so they can be tested
// without Docker.
import { basename } from "node:path";

export const GENERATED_ENV_HEADER =
  "# Written by `bun run dev:agent`; delete to regenerate.";

/** Labels on every container and volume `dev:agent` creates. */
export const ROLE_LABEL = "netplan.role=dev-backend";
export const WORKTREE_LABEL = "netplan.worktree";

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

/**
 * Where the worktree's ports start: a backend pair (API, then site) in
 * 13200-13999 and a web port in 3100-3999. The caller walks up from there
 * while a port is taken, so the same worktree usually gets the same ports.
 */
export const preferredPorts = (
  worktree: string,
): { backend: number; web: number } => {
  const value = Number.parseInt(digest(worktree).slice(0, 8), 16);
  return { backend: 13200 + (value % 400) * 2, web: 3100 + (value % 900) };
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

export const renderEnvFile = (values: Record<string, string>): string =>
  [
    GENERATED_ENV_HEADER,
    ...Object.entries(values).map(([name, value]) => `${name}=${value}`),
    "",
  ].join("\n");

/** `NAME=value` lines, as `convex env list` prints them. */
export const parseEnvLines = (text: string): Map<string, string> => {
  const values = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) values.set(match[1], match[2]);
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
