import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.bench.ts",
  workers: 1,
  reporter: "line",
  timeout: 300_000,
  use: { baseURL: "http://localhost:4400" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: { command: "node ../../../../fixtures/lettings-app/server.mjs", url: "http://localhost:4400", reuseExistingServer: true },
});
