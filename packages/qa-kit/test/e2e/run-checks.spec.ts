import { expect, test } from "@playwright/test";
import { defineQaConfig } from "../../src/config.ts";
import { runPageChecks } from "../../src/run-checks.ts";
import type { QaConfig } from "../../src/types.ts";

const base: QaConfig = defineQaConfig({
  baseURL: "http://localhost:4400",
  routes: ["/", "/properties"],
  roles: [{ name: "agent" }],
  scenarios: [],
  accessMatrix: {},
  designSystem: { componentMarker: "[data-ds]", maxVariants: { button: 3 } },
});

const rules = (found: Array<{ check: string; rule: string }>) => found.map((f) => `${f.check}/${f.rule}`);

test("the page checks include the unstyled rule", async ({ page }) => {
  await page.goto("/?defect=smoke-unstyled");
  expect(rules(await runPageChecks(page, base, ["smoke"]))).toEqual(["smoke/unstyled"]);
});

test("the a11y page check includes reflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/?defect=a11y-reflow");
  expect(rules(await runPageChecks(page, base, ["a11y"]))).toEqual(["a11y/reflow"]);
});

test("config.a11y.exclude goes to axe-core", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=a11y-name");
  expect(rules(await runPageChecks(page, base, ["a11y"]))).toContain("a11y/axe-button-name");
  const config = { ...base, a11y: { exclude: ['[data-variant="button:icon"]'] } };
  expect(rules(await runPageChecks(page, config, ["a11y"]))).not.toContain("a11y/axe-button-name");
});

test("config.ignore drops a matching finding and keeps the others", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=conformance-raw");
  expect(rules(await runPageChecks(page, base, ["conformance"]))).toEqual(["conformance/not-a-component"]);
  const config = defineQaConfig({ ...base, ignore: [{ check: "conformance", rule: "not-a-component", selector: ".actions", route: "/properties", reason: "The export button moves to the design system in the next release." }] });
  expect(await runPageChecks(page, config, ["conformance"])).toEqual([]);
  const elsewhere = defineQaConfig({ ...base, ignore: [{ check: "conformance", selector: ".actions", route: "/", reason: "Only on the home page." }] });
  expect(rules(await runPageChecks(page, elsewhere, ["conformance"]))).toEqual(["conformance/not-a-component"]);
});
