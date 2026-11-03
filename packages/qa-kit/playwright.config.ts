import { defineConfig, devices } from "@playwright/test";
import { ensureQaRunId } from "./src/manifest.ts";

ensureQaRunId(); // one run directory for all workers

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1, // one fixture server holds one defect cookie per browser context; keep runs simple
  reporter: "list",
  use: { baseURL: "http://localhost:4400" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: { command: "node ../../fixtures/lettings-app/server.mjs", url: "http://localhost:4400", reuseExistingServer: true },
});
