import { expect } from "@playwright/test";
import { createQaTest } from "../../src/fixture.ts";
import { checkLayout } from "../../src/checks/layout.ts";
import { defineQaConfig } from "../../src/config.ts";

const config = defineQaConfig({ baseURL: "http://localhost:4400", routes: ["/"], roles: [], scenarios: [], accessMatrix: {} });
const test = createQaTest(config);

test.describe("text scale 200%", () => {
  test.use({ qaTextScale: 2 });
  test("doubles the root font size before the page scripts run", async ({ page, qa }) => {
    void qa;
    await page.goto("/");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("32px");
  });
  test("rem text on the scale gives no off-scale-type finding, only when the scale is passed", async ({ page, qa, qaTextScale }) => {
    void qa;
    const rules = { componentMarker: "[data-ds]", typeScale: [[16, 400]] as Array<[number, number]> };
    await page.goto("/");
    await page.evaluate(() => { document.body.innerHTML = '<p style="font-size:1rem;font-weight:400">Body</p>'; });
    const offScale = async (textScale: number) => (await checkLayout(page, rules, { textScale })).filter((f) => f.rule === "off-scale-type");
    expect(await offScale(qaTextScale)).toEqual([]);
    expect(await offScale(1)).toHaveLength(1);
    await page.evaluate(() => { document.body.innerHTML = '<p style="font-size:16px;font-weight:400">Body</p>'; });
    expect(await offScale(qaTextScale)).toEqual([]);
  });
});

test("the default text scale changes nothing", async ({ page, qa }) => {
  void qa;
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("16px");
});
