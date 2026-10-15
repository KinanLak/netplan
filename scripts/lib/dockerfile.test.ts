import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONVEX_BACKEND_IMAGE } from "./convexBackend";

const root = join(import.meta.dir, "../..");

const dockerfileArg = async (name: string): Promise<string | undefined> => {
  const dockerfile = await readFile(join(root, "Dockerfile"), "utf8");
  return new RegExp(`^ARG ${name}=(\\S+)$`, "m").exec(dockerfile)?.[1];
};

test("the image runs the Bun version the repository pins", async () => {
  const pkg: unknown = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const packageManager =
    typeof pkg === "object" && pkg !== null && "packageManager" in pkg
      ? pkg.packageManager
      : undefined;
  expect(packageManager).toBe(`bun@${await dockerfileArg("BUN_VERSION")}`);
});

test("the functions image deploys with the backend image dev:agent runs", async () => {
  expect(await dockerfileArg("CONVEX_BACKEND_IMAGE")).toBe(
    CONVEX_BACKEND_IMAGE,
  );
});

const convexEnvNames = async (): Promise<Array<string>> => {
  const list = await readFile(join(root, "deploy/convex-env.txt"), "utf8");
  return list
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
};

// Set by Node or by the Convex backend itself, never by `convex env set`.
const PROVIDED_ENV = new Set([
  "NODE_ENV",
  "CONVEX_CLOUD_URL",
  "CONVEX_SITE_URL",
]);

test("convex-env.txt lists one Convex environment variable name per line", async () => {
  const names = await convexEnvNames();
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
  expect(new Set(names).size).toBe(names.length);
});

test("convex-env.txt lists every variable the Convex functions read", async () => {
  const listed = new Set(await convexEnvNames());
  const read = new Set<string>();
  for await (const file of new Bun.Glob("convex/**/*.ts").scan(root)) {
    if (file.includes("/_generated/") || file.endsWith(".test.ts")) continue;
    const source = await readFile(join(root, file), "utf8");
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      read.add(match[1]);
    }
  }
  expect(read.size).toBeGreaterThan(0);
  const missing = [...read].filter(
    (name) => !listed.has(name) && !PROVIDED_ENV.has(name),
  );
  expect(missing).toEqual([]);
});
