import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { ensureQaRunId, qaProjects } from "@feature-qa/kit";
import { IN_EVAL_SANDBOX } from "./eval-sandbox.ts";

// The eval sandbox gives each run a fresh HOME, so Playwright cannot find its browsers there.
// The file .browsers-path holds the folder of the installed browsers.
if (existsSync(".browsers-path")) process.env.PLAYWRIGHT_BROWSERS_PATH = readFileSync(".browsers-path", "utf8").trim();

ensureQaRunId(); // one run directory for all workers

export default defineConfig({
  testDir: "./specs",
  workers: 1,
  use: { baseURL: "http://localhost:4400" },
  projects: qaProjects({ browsers: ["chromium"], viewports: ["phone", "laptop"], extras: [] }),
  // The eval sandbox cannot open a port. There, eval-sandbox.ts serves the app inside the browser.
  ...(IN_EVAL_SANDBOX ? {} : { webServer: { command: "node app/server.mjs", url: "http://localhost:4400", reuseExistingServer: false } }),
});
