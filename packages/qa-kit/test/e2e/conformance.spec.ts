import { expect, test } from "@playwright/test";
import { checkConformance } from "../../src/checks/conformance.ts";
import type { DesignSystemRules } from "../../src/types.ts";

const rules: DesignSystemRules = {
  componentMarker: "[data-ds]",
  maxVariants: { button: 2 },
  variantAttribute: "data-variant",
  requiredRootAttributes: { "data-brand": "lettings" },
};

const cases: Array<[string, string, string]> = [
  ["conformance-raw", "/properties", "not-a-component"],
  ["conformance-variants", "/properties", "too-many-variants"],
  ["conformance-root", "/", "root-attribute"],
];

for (const [defect, route, rule] of cases) {
  test(`${defect} gives ${rule}`, async ({ page }) => {
    await page.goto("/sign-in?as=agent");
    await page.goto(`${route}?defect=${defect}`);
    const found = await checkConformance(page, rules);
    expect(found.map((f) => f.rule)).toEqual([rule]);
    expect(found[0]!.check).toBe("conformance");
    expect(found[0]!.severity).toBe("fail");
  });
}

for (const route of ["/", "/properties"]) {
  test(`clean ${route} has no conformance findings`, async ({ page }) => {
    await page.goto("/sign-in?as=agent");
    await page.goto(`${route}?defect=none`);
    expect(await checkConformance(page, rules)).toEqual([]);
  });
}

test("a raw button inside a marked card container fails", async ({ page }) => {
  await page.setContent(`<div data-ds data-slot="card"><h2>Card</h2><p><button>Raw</button></p><a data-ds href="#x">More</a></div>`);
  const found = await checkConformance(page, { componentMarker: "[data-ds]" });
  expect(found.map((f) => [f.rule, f.selector])).toEqual([["not-a-component", "body > div:nth-child(1) > p:nth-child(2) > button:nth-child(1)"]]);
});

test("a control inside a close component wrapper passes", async ({ page }) => {
  await page.setContent(`<span data-ds data-slot="checkbox"><label><input type="checkbox"> Agree</label></span>`);
  expect(await checkConformance(page, { componentMarker: "[data-ds]" })).toEqual([]);
});

test("a focusable tab panel and a focusable pre are not controls", async ({ page }) => {
  await page.setContent(`<div role="tabpanel" tabindex="0" aria-label="Panel">Panel text</div><pre tabindex="0">code</pre>`);
  expect(await checkConformance(page, { componentMarker: "[data-ds]" })).toEqual([]);
});

test("the component name comes from componentAttribute when the variant has no colon", async ({ page }) => {
  await page.setContent(`<button data-slot="button" data-variant="a">A</button>
<button data-slot="button" data-variant="b">B</button>
<button data-slot="button" data-variant="c">C</button>`);
  const found = await checkConformance(page, { componentMarker: "[data-slot]", maxVariants: { button: 2 } });
  expect(found.map((f) => [f.rule, f.sample])).toEqual([["too-many-variants", "button:a, button:b, button:c"]]);
});
