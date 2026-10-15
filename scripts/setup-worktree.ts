// Run by T3 Code when it creates a worktree (`t3.json`, "Setup Worktree"):
// installs dependencies, then pulls the pinned Convex backend image so the
// first `bun run dev:agent` does not wait for it. Starting the backend is left
// to `dev:agent`, so a worktree that never runs the app costs no container.
import { resolve } from "node:path";
import { CONVEX_BACKEND_IMAGE } from "./lib/convexBackend";

const root = resolve(import.meta.dir, "..");

// stdin closed: T3 Code runs this without a terminal to answer prompts.
const spawn = (command: Array<string>) =>
  Bun.spawn(command, {
    cwd: root,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  }).exited;

const installed = await spawn(["bun", "install"]);
if (installed !== 0) process.exit(installed);

const quiet = (command: Array<string>) =>
  Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" })
    .exited;

if ((await quiet(["docker", "version"])) !== 0) {
  console.log("setup-worktree: Docker is not available; dev:agent needs it.");
} else if (
  (await quiet(["docker", "image", "inspect", CONVEX_BACKEND_IMAGE])) !== 0
) {
  const pulled = await spawn(["docker", "pull", CONVEX_BACKEND_IMAGE]);
  if (pulled !== 0) process.exit(pulled);
}
