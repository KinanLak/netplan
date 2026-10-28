import { defineConfig, devices } from "@playwright/test";

// Drives the production build (`bun run build`) against a backend seeded by
// `convex/dev.ts`: the worktree's dev:agent backend locally, the service
// container in CI. The server reads the backend URLs from `CONVEX_URL` and
// `CONVEX_SITE_URL` at runtime; `bun run` loads them from dev:agent's
// `.env.local` locally.
const port = Number(process.env.E2E_PORT ?? 4310);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  // Not `*.spec.ts`: `bun test` would collect those.
  testMatch: "**/*.e2e.ts",
  forbidOnly: Boolean(process.env.CI),
  // One browser at a time on CI: the runner also hosts the app server and
  // the Convex backend, and two pages loading the map at once there took
  // longer than an expectation waits.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun .output/server/index.mjs",
    url: baseURL,
    env: { HOST: "127.0.0.1", PORT: String(port) },
    reuseExistingServer: false,
  },
});
