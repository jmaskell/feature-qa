// Config for the nested run in test/e2e/preflight.spec.ts. It is not part of the main run.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  outputDir: join(tmpdir(), "qa-kit-preflight-results"),
  globalSetup: "./global-setup.ts",
  workers: 1,
  projects: [{ name: "chromium" }],
});
