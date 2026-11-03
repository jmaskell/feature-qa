// These tests fail on purpose. test/e2e/wiring.spec.ts runs them in a nested run and reads the result.
import { createQaTest } from "../../src/fixture.ts";
import { defineQaConfig } from "../../src/config.ts";
// @ts-expect-error The fixture is plain JavaScript and has no types.
import { KNOWN_VALUES } from "../../../../fixtures/lettings-app/seed.mjs";

const config = defineQaConfig({
  baseURL: "http://localhost:4400",
  routes: ["/", "/properties/p1"],
  roles: [{ name: "agent" }],
  scenarios: [{ name: "lettings", states: ["default"], knownValues: KNOWN_VALUES as string[] }],
  accessMatrix: {},
});

const test = createQaTest(config);

test("smoke console", async ({ page, qa }) => {
  void qa; // the fixture runs the watchers around the test
  await page.goto("/?defect=smoke-console");
});

test("leaks title", async ({ page, qa }) => {
  void qa;
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties/p1?defect=leaks-title");
});
