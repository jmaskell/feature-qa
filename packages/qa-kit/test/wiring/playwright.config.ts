// Config for the nested run in test/e2e/wiring.spec.ts. It is not part of the main run.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  outputDir: join(tmpdir(), "qa-kit-wiring-results"),
  workers: 1,
  retries: 0,
  use: { baseURL: "http://localhost:4400" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: { command: "node ../../../../fixtures/lettings-app/server.mjs", url: "http://localhost:4400", reuseExistingServer: true },
});
