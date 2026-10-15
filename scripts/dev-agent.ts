// A complete local instance for one checkout, safe to run next to other
// worktrees (ADR 0018, AGENTS.md "Local instance"):
//   bun run dev:agent            set up if needed, then run Convex and Vite
//   bun run dev:agent --setup    set up only
//   bun run dev:agent --reseed   start again from an empty backend (app stopped)
//   bun run dev:agent --integrations
//                                also connect the demo site to the NetBox and
//                                LibreNMS named by NETBOX_URL/TOKEN and
//                                LIBRENMS_URL/TOKEN in this environment
//   bun run dev:agent --status   print this worktree's URLs
//   bun run dev:agent --down     remove this worktree's backend and data
// The backend is a Docker container of the pinned self-hosted image, with
// SQLite in a volume, both named after the worktree and labelled with its
// path. A Mailpit container on a network of the same name catches the mail
// it sends. Both keep running when this command stops.
import {
  chmodSync,
  lstatSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import type { Subprocess } from "bun";
import {
  CONVEX_BACKEND_IMAGE,
  backendAnswers,
  isLoopbackUrl,
} from "./lib/convexBackend";
import {
  MAILPIT_IMAGE,
  OWNER_LABEL,
  ROLE_LABEL,
  WORKTREE_LABEL,
  backendOf,
  integrationSeedArgs,
  isGeneratedEnvFile,
  mailName,
  nextBackendPorts,
  nextWebPort,
  parseEnvLines,
  preferredPorts,
  publishedPort,
  renderEnvFile,
  resourceName,
} from "./lib/devAgent";

// Every function the seed runs, in order. Each one is idempotent and refuses
// to run without ALLOW_DEV_SEED.
const SEED_FUNCTIONS = ["dev:seed", "dev:seedAccounts"];

// Where the last run served the app, for `--status`.
const WEB_URL_KEY = "NETPLAN_DEV_WEB_URL";

const root = realpathSync(resolve(import.meta.dir, ".."));
const envPath = join(root, ".env.local");
const name = resourceName(root);
const mail = mailName(name);
// Docker is shared by every account on the host: orphan collection only
// considers this account's backends.
const owner = `${OWNER_LABEL}=${process.getuid?.() ?? "unknown"}`;
const flags = new Set(Bun.argv.slice(2));
const children: Array<Subprocess> = [];

const stop = (code: number): never => {
  for (const child of children) child.kill();
  process.exit(code);
};
const fail = (message: string): never => {
  console.error(`dev:agent: ${message}`);
  return stop(1);
};
process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));

// The Convex CLI lets the environment override `.env.local`, and Bun loads
// `.env.local` into this process: no child sees a CONVEX_* or VITE_CONVEX_*
// variable other than the ones this script sets.
const baseEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value === undefined) continue;
  if (key.startsWith("CONVEX_") || key.startsWith("VITE_CONVEX_")) continue;
  baseEnv[key] = value;
}
// The Convex CLI also reads `.env` itself, where a deploy key would win over
// the self-hosted URL and send the push and the seed to a real deployment.
// It treats an empty value as unset, and dotenv never overrides one.
const convexIsolation = {
  CONVEX_DEPLOY_KEY: "",
  CONVEX_DEPLOYMENT_TOKEN: "",
  CONVEX_DEPLOYMENT: "",
};

const run = async (
  command: Array<string>,
  env: Record<string, string> = baseEnv,
  input?: string,
) => {
  const child = Bun.spawn(command, {
    cwd: root,
    env,
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { ok: code === 0, out, err };
};

const must = async (
  result: ReturnType<typeof run>,
  what: string,
): Promise<string> => {
  const { ok, out, err } = await result;
  if (!ok) fail(`${what} failed:\n${err || out}`);
  return out;
};

const docker = (...args: Array<string>) => run(["docker", ...args]);

// ── Docker resources ─────────────────────────────────────────────────────────

interface Container {
  running: boolean;
  image: string;
  /** The host port published for the container port asked about. */
  port?: number;
  networks: Array<string>;
}

const inspectContainer = async (
  target: string,
  containerPort: number,
): Promise<Container | undefined> => {
  const result = await docker(
    "container",
    "inspect",
    "--format",
    "{{json .State.Running}} {{json .Config.Image}} {{json .HostConfig.PortBindings}} {{json .NetworkSettings.Networks}}",
    target,
  );
  if (!result.ok) return undefined;
  const [running, image, bindings, networks] = result.out
    .trim()
    .split(" ")
    .map((part) => JSON.parse(part) as unknown);
  return {
    running: running === true,
    image: String(image),
    port: publishedPort(
      bindings as Parameters<typeof publishedPort>[0],
      containerPort,
    ),
    networks: Object.keys(networks ?? {}),
  };
};

/**
 * Removes a backend's containers, volume and network; returns Docker's
 * error, if any. `--force` already accepts a resource that is not there.
 */
const removeBackend = async (target: string): Promise<string | undefined> => {
  for (const command of [
    ["container", "rm", "--force", mailName(target)],
    ["container", "rm", "--force", "--volumes", target],
    ["volume", "rm", "--force", target],
    ["network", "rm", "--force", target],
  ]) {
    const { ok, out, err } = await docker(...command);
    if (!ok) return (err || out).trim() || `docker ${command[0]} rm failed`;
  }
  return undefined;
};

const mustRemoveBackend = async (target: string) => {
  const error = await removeBackend(target);
  if (error) fail(`could not remove ${target}: ${error}`);
};

// Only a path that is certainly gone: another account's worktree is
// unreadable, not missing.
const isGone = (path: string) => {
  try {
    statSync(path);
    return false;
  } catch (error) {
    return (error as { code?: string }).code === "ENOENT";
  }
};

/** Removes this account's backends whose worktree no longer exists. */
const collectOrphans = async () => {
  const listed = await Promise.all(
    (["container", "volume", "network"] as const).map((kind) =>
      docker(
        kind,
        "ls",
        ...(kind === "container" ? ["--all"] : []),
        "--filter",
        `label=${ROLE_LABEL}`,
        "--filter",
        `label=${owner}`,
        "--format",
        `${kind === "container" ? "{{.Names}}" : "{{.Name}}"}\t{{.Label "${WORKTREE_LABEL}"}}`,
      ),
    ),
  );
  const orphans = new Set<string>();
  for (const { out } of listed) {
    for (const line of out.split("\n").filter(Boolean)) {
      const [resource, worktree] = line.split("\t");
      if (resource && worktree && isGone(worktree)) {
        orphans.add(backendOf(resource));
      }
    }
  }
  for (const orphan of orphans) {
    console.log(`dev:agent: removing ${orphan}, its worktree is gone.`);
    // Not this worktree's: a failure is worth a line, not a stop.
    const error = await removeBackend(orphan);
    if (error) console.error(`dev:agent: could not remove ${orphan}: ${error}`);
  }
};

const portIsFree = (port: number, hostnames: Array<string>) =>
  hostnames.every((hostname) => {
    try {
      Bun.listen({ hostname, port, socket: { data() {} } }).stop(true);
      return true;
    } catch (error) {
      // A machine without IPv6 fails on `::1` for another reason.
      return (error as { code?: string }).code !== "EADDRINUSE";
    }
  });

const labels = [
  "--label",
  ROLE_LABEL,
  "--label",
  `${WORKTREE_LABEL}=${root}`,
  "--label",
  owner,
];

const createContainer = async (backendPort: number) => {
  await must(
    docker("volume", "create", ...labels, name),
    "docker volume create",
  );
  await must(
    docker(
      "run",
      "--detach",
      "--name",
      name,
      ...labels,
      "--publish",
      `127.0.0.1:${backendPort}:3210`,
      "--publish",
      `127.0.0.1:${backendPort + 1}:3211`,
      "--volume",
      `${name}:/convex/data`,
      "--env",
      `CONVEX_CLOUD_ORIGIN=http://127.0.0.1:${backendPort}`,
      "--env",
      `CONVEX_SITE_ORIGIN=http://127.0.0.1:${backendPort + 1}`,
      "--env",
      "DISABLE_BEACON=true",
      CONVEX_BACKEND_IMAGE,
    ),
    "docker run",
  );
};

/** Starts the worktree's backend, creating it if needed; returns its API port. */
const ensureBackend = async (): Promise<number> => {
  let container = await inspectContainer(name, 3210);
  // A new image pin replaces the container; the data stays in the volume.
  if (container && container.image !== CONVEX_BACKEND_IMAGE) {
    console.log(`dev:agent: moving ${name} to the pinned backend image.`);
    await docker("container", "rm", "--force", name);
    const port = container.port;
    container = undefined;
    if (port) {
      await createContainer(port);
      container = await inspectContainer(name, 3210);
    }
  }
  if (!container) {
    const port = nextBackendPorts(preferredPorts(root).backend, (candidate) =>
      portIsFree(candidate, ["127.0.0.1"]),
    );
    console.log(`dev:agent: creating ${name} on port ${port}.`);
    await createContainer(port);
    container = await inspectContainer(name, 3210);
  } else if (!container.running) {
    await must(docker("container", "start", name), "docker start");
  }
  const port = container?.port;
  if (!port) return fail(`${name} publishes no port for 3210.`);

  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await backendAnswers(url)) return port;
    await Bun.sleep(500);
  }
  return fail(`the backend at ${url} did not answer within a minute.`);
};

/**
 * Starts the worktree's Mailpit on a network shared with the backend, which
 * reaches it by container name; returns the port of its inbox. Its mail lives
 * in the container: a new image pin starts an empty inbox.
 */
const ensureMail = async (): Promise<number> => {
  if (!(await docker("network", "inspect", name)).ok) {
    await must(
      docker("network", "create", ...labels, name),
      "docker network create",
    );
  }
  let container = await inspectContainer(mail, 8025);
  if (container && container.image !== MAILPIT_IMAGE) {
    await docker("container", "rm", "--force", mail);
    container = undefined;
  }
  if (!container) {
    const port = nextWebPort(preferredPorts(root).mail, (candidate) =>
      portIsFree(candidate, ["127.0.0.1"]),
    );
    await must(
      docker(
        "run",
        "--detach",
        "--name",
        mail,
        ...labels,
        "--network",
        name,
        "--publish",
        `127.0.0.1:${port}:8025`,
        "--env",
        "MP_SMTP_AUTH_ACCEPT_ANY=1",
        "--env",
        "MP_SMTP_AUTH_ALLOW_INSECURE=1",
        MAILPIT_IMAGE,
      ),
      "docker run mailpit",
    );
    container = await inspectContainer(mail, 8025);
  } else if (!container.running) {
    await must(docker("container", "start", mail), "docker start mailpit");
  }
  // A backend created before Mailpit joins the network while it runs.
  if (!(await inspectContainer(name, 3210))?.networks.includes(name)) {
    await must(
      docker("network", "connect", name, name),
      "docker network connect",
    );
  }
  const port = container?.port;
  if (!port) return fail(`${mail} publishes no port for 8025.`);
  return port;
};

// ── Integrations ─────────────────────────────────────────────────────────────

// The tokens go in a request body with the admin key, never on a command
// line, where the process list would show them.
async function seedIntegrations(convexUrl: string, adminKey: string) {
  const { args, missing } = integrationSeedArgs(process.env);
  if (missing.length > 0) {
    console.log(`dev:agent: --integrations: ${missing.join(", ")} not set.`);
  }
  if (!args.netbox && !args.librenms) return;
  const response = await fetch(`${convexUrl}/api/function`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Convex ${adminKey}`,
    },
    body: JSON.stringify({
      path: "dev:seedIntegrations",
      format: "convex_encoded_json",
      args,
    }),
  });
  const result = (await response.json().catch(() => null)) as {
    status?: string;
    value?: Array<string>;
    errorMessage?: string;
  } | null;
  if (result?.status !== "success") {
    fail(
      `dev:seedIntegrations failed: ${result?.errorMessage ?? `HTTP ${response.status}`}`,
    );
  }
  const created = result?.value ?? [];
  console.log(
    created.length > 0
      ? `dev:agent: connected the demo site to ${created.join(" and ")}.`
      : "dev:agent: the demo site already has its integrations.",
  );
}

// ── .env.local ───────────────────────────────────────────────────────────────

const readOwnEnvFile = async (): Promise<string | undefined> => {
  const stat = lstatSync(envPath, { throwIfNoEntry: false });
  if (!stat) return undefined;
  const text = stat.isFile() ? await Bun.file(envPath).text() : "";
  if (!isGeneratedEnvFile(text)) {
    fail(
      ".env.local was not written by dev:agent, so it may point at a real " +
        "deployment. Move it away and run again.",
    );
  }
  return text;
};

const writeEnvFile = async (values: Record<string, string>) => {
  const text = renderEnvFile(values);
  if ((await readOwnEnvFile()) === text) return;
  // It holds the admin key: never readable by others, even briefly.
  writeFileSync(envPath, text, { mode: 0o600 });
  chmodSync(envPath, 0o600);
};

const webAnswers = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(1500) }).then(
    (response) => response.ok,
    () => false,
  );

// A recorded URL may since belong to another checkout's server. Vite serves
// files of its own workspace by absolute path and refuses any other.
const servesThisWorktree = (url: string) =>
  webAnswers(`${url}/@fs${root}/package.json`);

// ── Commands ─────────────────────────────────────────────────────────────────

const urls = (backendPort: number, webPort?: number) => ({
  convex: `http://127.0.0.1:${backendPort}`,
  site: `http://127.0.0.1:${backendPort + 1}`,
  web: webPort ? `http://127.0.0.1:${webPort}` : undefined,
});

if (flags.has("--down")) {
  await readOwnEnvFile();
  await mustRemoveBackend(name);
  rmSync(envPath, { force: true });
  console.log(`dev:agent: removed ${name}, its Mailpit and .env.local.`);
  process.exit(0);
}

if (flags.has("--status")) {
  const container = await inspectContainer(name, 3210);
  if (!container?.port) {
    console.log(`dev:agent: no backend for ${root}.`);
    process.exit(0);
  }
  const { convex } = urls(container.port);
  const web = parseEnvLines((await readOwnEnvFile()) ?? "").get(WEB_URL_KEY);
  const silent = (up: boolean) => (up ? "" : " (not answering)");
  console.log(
    `${name}: ${container.running ? "running" : "stopped"}\n` +
      `  Convex   ${convex}${silent(await backendAnswers(convex))}`,
  );
  if (web) {
    console.log(`  App      ${web}${silent(await servesThisWorktree(web))}`);
  }
  const inbox = await inspectContainer(mail, 8025);
  if (inbox?.port) {
    const url = `http://127.0.0.1:${inbox.port}`;
    console.log(`  Mail     ${url}${silent(await webAnswers(url))}`);
  }
  process.exit(0);
}

if (!(await docker("version", "--format", "{{.Server.Version}}")).ok) {
  fail("Docker is not available; the local backend runs in a container.");
}
const recorded = parseEnvLines((await readOwnEnvFile()) ?? "").get(WEB_URL_KEY);
await collectOrphans();
if (flags.has("--reseed")) {
  // Its `convex dev` would keep pushing with the removed backend's key.
  if (recorded && (await servesThisWorktree(recorded))) {
    fail(`the app is running at ${recorded}; stop it before --reseed.`);
  }
  console.log(`dev:agent: removing ${name} to start from an empty backend.`);
  await mustRemoveBackend(name);
}

// A worktree may start without dependencies, and a pull may change the
// lockfile. Bun links from its cache, so this is quick.
await must(run(["bun", "install"]), "bun install");

const backendPort = await ensureBackend();
const mailUrl = `http://127.0.0.1:${await ensureMail()}`;
const { convex: convexUrl, site: siteUrl } = urls(backendPort);
if (!isLoopbackUrl(convexUrl)) fail(`${convexUrl} is not on this machine.`);
const convexCliWith = (env: Record<string, string>, args: Array<string>) =>
  run([join(root, "node_modules/.bin/convex"), ...args], {
    ...baseEnv,
    ...convexIsolation,
    ...env,
  });

// Each generated key is different, so the recorded one is kept while this
// backend still accepts it: a rewritten `.env.local` restarts a running Vite.
const previous = parseEnvLines((await readOwnEnvFile()) ?? "");
let adminKey =
  previous.get("CONVEX_SELF_HOSTED_URL") === convexUrl
    ? previous.get("CONVEX_SELF_HOSTED_ADMIN_KEY")
    : undefined;
if (
  adminKey &&
  !(
    await convexCliWith(
      {
        CONVEX_SELF_HOSTED_URL: convexUrl,
        CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
      },
      ["env", "list"],
    )
  ).ok
) {
  adminKey = undefined;
}
adminKey ??= (
  await must(
    docker("exec", name, "./generate_admin_key.sh"),
    "generate_admin_key.sh",
  )
)
  .trim()
  .split("\n")
  .at(-1);
if (!adminKey) fail("generate_admin_key.sh printed no key.");

const webPort = nextWebPort(preferredPorts(root).web, (port) =>
  portIsFree(port, ["127.0.0.1", "::1"]),
);
const webUrl = urls(backendPort, webPort).web ?? "";
const convexValues = {
  CONVEX_SELF_HOSTED_URL: convexUrl,
  CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey ?? "",
  CONVEX_URL: convexUrl,
  CONVEX_SITE_URL: siteUrl,
};
// Written before Vite starts: Vite restarts when an env file changes.
// `--setup` keeps the URL of a run that may still be serving.
const servedUrl = flags.has("--setup") ? previous.get(WEB_URL_KEY) : webUrl;
await writeEnvFile(
  servedUrl ? { ...convexValues, [WEB_URL_KEY]: servedUrl } : convexValues,
);
const childEnv = { ...baseEnv, ...convexIsolation, ...convexValues };
const convexCli = (...args: Array<string>) => convexCliWith(convexValues, args);

const watch = (child: Subprocess) => {
  children.push(child);
  void child.exited.then((code) => {
    console.error("dev:agent: a dev server exited; stopping.");
    stop(code || 1);
  });
};
// Vite needs only the backend's URL, so it compiles while functions push.
if (!flags.has("--setup")) {
  watch(
    Bun.spawn(
      [
        join(root, "node_modules/.bin/vite"),
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      { cwd: root, env: childEnv, stdout: "inherit", stderr: "inherit" },
    ),
  );
}

const variables = parseEnvLines(
  await must(convexCli("env", "list"), "convex env list"),
);
const authEnv: Record<string, string> = {
  ALLOW_DEV_SEED: "true",
  // better-auth accepts requests only from these origins: the app, and the
  // production build `bun run test:e2e` serves against this backend.
  SITE_URL: servedUrl ?? webUrl,
  TRUSTED_ORIGINS: "http://127.0.0.1:4310",
  // The backend checks each token against its own JWKS; its published port
  // does not answer inside its container.
  AUTH_JWKS_URL: "http://127.0.0.1:3211/api/auth/convex/jwks",
  SMTP_HOST: mail,
  SMTP_PORT: "1025",
  SMTP_FROM: "Netplan <netplan@netplan.localhost>",
};
// Generated once per backend and never printed: it signs every session.
if (!variables.get("BETTER_AUTH_SECRET")) {
  authEnv.BETTER_AUTH_SECRET = randomBytes(32).toString("base64url");
}
// The same for the key that encrypts integration tokens: a new one would
// leave the stored tokens unreadable.
if (!variables.get("NETPLAN_SECRET_KEY")) {
  authEnv.NETPLAN_SECRET_KEY = randomBytes(32).toString("base64");
}
for (const [key, value] of Object.entries(authEnv)) {
  if (variables.get(key) === value) continue;
  // Through stdin, so a secret never reaches a process list.
  await must(
    run(
      [join(root, "node_modules/.bin/convex"), "env", "set", key],
      { ...baseEnv, ...convexIsolation, ...convexValues },
      value,
    ),
    `convex env set ${key}`,
  );
}
console.log("dev:agent: pushing functions…");
await must(
  convexCli(
    "dev",
    "--once",
    "--typecheck",
    "disable",
    "--tail-logs",
    "disable",
  ),
  "convex dev --once",
);
for (const seed of SEED_FUNCTIONS) {
  await must(convexCli("run", seed), `convex run ${seed}`);
}
if (flags.has("--integrations")) {
  await seedIntegrations(convexUrl, adminKey ?? "");
}

if (flags.has("--setup")) {
  console.log(
    `dev:agent: ready, Convex ${convexUrl}. \`bun run dev:agent\` starts the app.`,
  );
  process.exit(0);
}

watch(
  Bun.spawn(
    [join(root, "node_modules/.bin/convex"), "dev", "--typecheck", "disable"],
    {
      cwd: root,
      env: childEnv,
      stdout: "inherit",
      stderr: "inherit",
    },
  ),
);

let up = false;
for (let attempt = 0; attempt < 120 && !up; attempt += 1) {
  up = await webAnswers(webUrl);
  if (!up) await Bun.sleep(500);
}
if (!up) fail(`${webUrl} did not answer within a minute.`);

console.log(`
Netplan is running for ${root}
  App      ${webUrl}
  Convex   ${convexUrl}  (container ${name})
  Mail     ${mailUrl}  (every mail the app sends)
  Data     Site de démonstration, Bâtiment A, two floors
Ctrl-C stops the app; the backend keeps running. \`bun run dev:agent --down\` removes it.
`);
