import { defineConfig, devices } from "@playwright/test";

// Drives the production build (`bun run build`) against a backend seeded by
// `convex/dev.ts`: the worktree's dev:agent backend locally, the service
// container in CI. The build reads the backend URL from `VITE_CONVEX_URL`.
const port = Number(process.env.E2E_PORT ?? 4310);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  // Not `*.spec.ts`: `bun test` would collect those.
  testMatch: "**/*.e2e.ts",
  forbidOnly: Boolean(process.env.CI),
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
