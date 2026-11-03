import { expect, test } from "@playwright/test";
import { checkLayout } from "../../src/checks/layout.ts";

const rules = { componentMarker: "[data-ds]", typeScale: [[16, 400], [32, 600], [24, 600], [14, 400], [16, 600]] as Array<[number, number]> };

const cases = [
  ["layout-overflow", "/properties", "horizontal-overflow", { width: 375, height: 800 }],
  ["layout-align", "/properties", "misaligned-sibling", { width: 1280, height: 800 }],
  ["layout-type", "/", "off-scale-type", { width: 1280, height: 800 }],
  ["layout-clip", "/properties/p1", "clipped-text", { width: 1280, height: 800 }],
] as const;

for (const [defect, route, rule, size] of cases) {
  test(`${defect} fails with ${rule}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/sign-in?as=agent");
    await page.goto(`${route}?defect=${defect}`);
    const found = await checkLayout(page, rules);
    expect(found.map((f) => f.rule)).toContain(rule);
  });
}

for (const width of [375, 1280]) {
  for (const route of ["/", "/properties", "/properties/p1"]) {
    test(`clean ${route} at ${width} has no layout findings`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/sign-in?as=agent");
      await page.goto(`${route}?defect=none`);
      expect(await checkLayout(page, rules)).toEqual([]);
    });
  }
}

test("an open modal dialog does not make its buttons overlap the page behind it", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties/p1");
  await page.getByRole("button", { name: "Message tenant" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  const found = await checkLayout(page, rules);
  expect(found.filter((f) => f.rule === "overlap")).toEqual([]);
});

for (const [kind, attrs] of [["role=dialog", 'role="dialog"'], ["aria-modal", 'aria-modal="true"']] as const) {
  test(`a modal with ${kind} does not make its buttons overlap the page behind it`, async ({ page }) => {
    await page.setContent(`<style>body{margin:0} a,button{display:inline-block;width:120px;height:32px;cursor:pointer}
      .modal{position:absolute;top:0;left:0;width:300px;padding:0;background:#fff}</style>
      <main><a href="#a">Behind</a></main>
      <div class="modal" ${attrs} aria-label="Message"><section><button>Send</button></section></div>`);
    const found = await checkLayout(page);
    expect(found.filter((f) => f.rule === "overlap")).toEqual([]);
  });
}
