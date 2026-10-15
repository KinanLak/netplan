// Checks that `convex/_generated`, and the better-auth component's, are
// exactly what `convex codegen` writes for the current functions. Codegen needs a deployment, so this runs against a
// self-hosted backend on this machine: the worktree's `dev:agent` backend
// locally, the service container in CI. Without one it says it skipped, unless
// `CODEGEN_CHECK_REQUIRED=true` (CI). The directory is restored afterwards, so the
// check never changes the tree.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { backendAnswers, isLoopbackUrl } from "./lib/convexBackend";

const GENERATED_DIRS = ["_generated", "betterAuth/_generated"].map((dir) =>
  join(import.meta.dir, "..", "convex", dir),
);

type Snapshot = Map<string, string>;

const CONVEX_DIR = join(import.meta.dir, "..", "convex");

// Keyed by path under `convex/`, so one snapshot spans several directories.
const readSnapshots = async (dirs: Array<string>): Promise<Snapshot> => {
  const snapshot: Snapshot = new Map();
  for (const dir of dirs) {
    const entries = await readdir(dir, {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const path = join(entry.parentPath, entry.name);
      snapshot.set(relative(CONVEX_DIR, path), await readFile(path, "utf8"));
    }
  }
  return snapshot;
};

const writeSnapshots = async (dirs: Array<string>, snapshot: Snapshot) => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  for (const [path, content] of snapshot) {
    const target = join(CONVEX_DIR, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
};

/** Files that differ between two snapshots, each marked added, removed or changed. */
export const diffSnapshots = (
  committed: Snapshot,
  generated: Snapshot,
): Array<string> => {
  const paths = new Set([...committed.keys(), ...generated.keys()]);
  const differences: Array<string> = [];
  for (const path of [...paths].sort()) {
    const before = committed.get(path);
    const after = generated.get(path);
    if (before === after) continue;
    if (before === undefined) differences.push(`added   ${path}`);
    else if (after === undefined) differences.push(`removed ${path}`);
    else differences.push(`changed ${path}`);
  }
  return differences;
};

const main = async () => {
  const required = process.env.CODEGEN_CHECK_REQUIRED === "true";
  const url = process.env.CONVEX_SELF_HOSTED_URL;
  const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;

  const skip = (reason: string) => {
    if (required) {
      console.error(`codegen:check: ${reason}`);
      process.exit(1);
    }
    console.log(`codegen:check: skipped, ${reason} (CI checks it).`);
    process.exit(0);
  };

  if (!url || !adminKey) {
    skip("no local backend configured, `bun run dev:agent --setup` makes one");
    return;
  }
  if (!isLoopbackUrl(url)) {
    skip(`CONVEX_SELF_HOSTED_URL is not on this machine`);
    return;
  }
  if (!(await backendAnswers(url))) {
    skip(`the local backend at ${url} does not answer`);
    return;
  }

  const committed = await readSnapshots(GENERATED_DIRS);
  let generated: Snapshot;
  try {
    // Removed first, so a file codegen no longer writes shows up too.
    for (const dir of GENERATED_DIRS) {
      await rm(dir, { recursive: true, force: true });
    }
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !key.startsWith("CONVEX_")) env[key] = value;
    }
    env.CONVEX_SELF_HOSTED_URL = url;
    env.CONVEX_SELF_HOSTED_ADMIN_KEY = adminKey;
    // The CLI also reads `.env`, where a deploy key would beat the URL above.
    // It treats an empty value as unset, and dotenv never overrides one.
    env.CONVEX_DEPLOY_KEY = "";
    env.CONVEX_DEPLOYMENT_TOKEN = "";
    env.CONVEX_DEPLOYMENT = "";
    const codegen = Bun.spawn(
      ["bun", "x", "convex", "codegen", "--typecheck", "disable"],
      { env, stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stderr] = await Promise.all([
      codegen.exited,
      new Response(codegen.stderr).text(),
    ]);
    if (exitCode !== 0) {
      console.error(stderr);
      throw new Error(`convex codegen exited with ${exitCode}`);
    }
    generated = await readSnapshots(GENERATED_DIRS);
  } finally {
    await writeSnapshots(GENERATED_DIRS, committed);
  }

  const differences = diffSnapshots(committed, generated);
  if (differences.length > 0) {
    console.error(
      "codegen:check: generated Convex code is stale. Regenerate it with `bun x convex codegen` against your dev:agent backend and commit it:",
    );
    for (const line of differences) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log("codegen:check: generated Convex code is current.");
};

if (import.meta.main) await main();
