import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { createQaTest } from "../../src/fixture.ts";
import { defineQaConfig } from "../../src/config.ts";
import { readManifest, runDir } from "../../src/manifest.ts";
// @ts-expect-error The fixture is plain JavaScript and has no types.
import { KNOWN_VALUES } from "../../../../fixtures/lettings-app/seed.mjs";

const config = defineQaConfig({
  baseURL: "http://localhost:4400",
  routes: ["/", "/properties", "/properties/p1"],
  roles: [{ name: "agent" }],
  scenarios: [{ name: "lettings", states: ["default"], knownValues: KNOWN_VALUES as string[] }],
  accessMatrix: {},
  designSystem: {
    componentMarker: "[data-ds]",
    maxVariants: { button: 2 },
    variantAttribute: "data-variant",
    requiredRootAttributes: { "data-brand": "lettings" },
  },
  copy: { bannedTerms: ["seamless"], maxButtonWords: 4, emptyValueWord: "None" },
});

const test = createQaTest(config, { serverLog: () => fetch("http://localhost:4400/__log").then((r) => r.text()) });

test("a clean page gives a record with no findings", async ({ page, qa }, testInfo) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=none");
  const rec = await qa.step("properties list", { state: "default", criteria: ["AC1"] });
  expect(existsSync(join(runDir(), rec.screenshot))).toBe(true);
  expect(rec.findings).toEqual([]);
  expect(rec.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(rec.seq).toBeGreaterThan(0);
  expect(rec.id).toMatch(/^[^/]+\/fixture-spec\/[^/]+\/01-properties-list\/\d+x\d+$/);
  expect(rec.id.startsWith(`${testInfo.project.name}/`)).toBe(true);
  expect(rec.route).toBe("/properties");
  expect(rec.aria).toContain("heading");
  const manifest = await readManifest(runDir());
  expect(manifest.steps.map((s) => s.id)).toContain(rec.id);
});

test("qa.step captures the page before the checks change it", async ({ page, qa }) => {
  await page.setContent(`<style>button{cursor:pointer} button:focus-visible{outline:2px solid blue}</style>
    <p id="state">Waiting</p>
    <button onmouseenter="document.getElementById('state').textContent='Hovered'">Point here</button>`);
  const rec = await qa.step("before hover", { checks: ["interaction"] });
  expect(rec.text).toContain("Waiting");
  expect(rec.text).not.toContain("Hovered");
  await expect(page.locator("#state")).toHaveText("Hovered"); // the hover check ran after the capture
});

const withActions = defineQaConfig({
  ...config,
  actions: [{ route: "/properties", role: "agent", selector: "[data-action=add-property]", label: "Add property" }],
});
const actionTest = createQaTest(withActions);
const ignoringDead = createQaTest(defineQaConfig({
  ...withActions,
  ignore: [{ check: "smoke", rule: "dead-action", route: "/properties", reason: "Test: the fixture plants a dead action." }],
}));

actionTest("qa.step with actionsAs clicks the declared actions after the capture", async ({ page, qa }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=none");
  const rec = await qa.step("properties list", { actionsAs: "agent" });
  expect(rec.findings).toEqual([]);
  expect(rec.text).not.toContain("Property details are added on the next screen.");
  await expect(page.locator("[data-action=add-property]")).toHaveAttribute("aria-expanded", "true");
});

ignoringDead("qa.step with actionsAs applies config.ignore to the action findings", async ({ page, qa }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=smoke-dead-action");
  const rec = await qa.step("properties list", { actionsAs: "agent", checks: [] });
  expect(rec.findings).toEqual([]);
});

actionTest.describe("a dead declared action with no ignore entry", () => {
  actionTest.fail();
  actionTest("makes the test fail through expect.soft", async ({ page, qa }) => {
    await page.goto("/sign-in?as=agent");
    await page.goto("/properties?defect=smoke-dead-action");
    await qa.step("properties list", { actionsAs: "agent", checks: [] });
  });
});

test.describe("a defect", () => {
  test.fail();
  test("makes the test fail through expect.soft", async ({ page, qa }) => {
    await page.goto("/sign-in?as=agent");
    await page.goto("/properties?defect=interaction-cursor");
    await qa.step("properties list");
  });
});
