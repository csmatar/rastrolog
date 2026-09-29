import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4321" },
  webServer: {
    // node, not `pnpm exec`: pnpm starts the child in its own session, which Playwright's
    // process-group kill can't reach, so the run hangs at the end. --ignore-lock: Astro
    // backgrounds preview when an AI agent runs it.
    command: "node ./node_modules/astro/bin/astro.mjs preview --port 4321 --ignore-lock",
    url: "http://localhost:4321/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
