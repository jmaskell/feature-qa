// Times the page checks of one step on the fixture pages. Run: npx playwright test -c test/bench/playwright.config.ts
import { test } from "@playwright/test";
import { defineQaConfig } from "../../src/config.ts";
import { runPageChecks } from "../../src/run-checks.ts";
import { timingTable, type Timings } from "../../src/timing.ts";

const config = defineQaConfig({
  baseURL: "http://localhost:4400", routes: ["/"], roles: [{ name: "agent" }], scenarios: [], accessMatrix: {},
  designSystem: { componentMarker: "[data-ds]", maxVariants: { button: 3 } },
});

for (const route of ["/properties", "/properties/p1", "/"]) {
  test(`step checks on ${route}`, async ({ page }) => {
    await page.goto("/sign-in?as=agent");
    await page.goto(`${route}?defect=none`);
    const runs: Array<{ timings: Timings }> = [];
    for (let i = 0; i < 5; i++) {
      const timings: Timings = {};
      const start = performance.now();
      await runPageChecks(page, config, undefined, { timings });
      timings.checks = Math.round(performance.now() - start);
      runs.push({ timings });
    }
    const rows = timingTable(runs).filter((r) => r.part !== "total");
    console.log(`${test.info().project.name} ${route}\n${rows.map((r) => `  ${r.part.padEnd(28)} ${String(r.median).padStart(6)} ms`).join("\n")}`);
  });
}
