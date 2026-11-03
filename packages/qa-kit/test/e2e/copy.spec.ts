import { expect, test } from "@playwright/test";
import { checkCopy } from "../../src/checks/copy.ts";
import type { CopyRules } from "../../src/types.ts";

const rules: CopyRules = { bannedTerms: ["seamless"], maxButtonWords: 4, emptyValueWord: "None" };

const cases: Array<[string, string, string]> = [
  ["copy-punctuation", "/properties/p1", "doubled-punctuation"],
  ["copy-label-echo", "/properties/p1", "label-echo"],
  ["copy-identifier", "/properties/p1", "leaked-identifier"],
  ["copy-banned", "/", "banned-term"],
  ["copy-button-length", "/properties", "button-length"],
  ["copy-empty-values", "/properties", "mixed-empty-values"],
];

for (const [defect, route, rule] of cases) {
  test(`${defect} gives ${rule}`, async ({ page }) => {
    await page.goto("/sign-in?as=agent");
    await page.goto(`${route}?defect=${defect}`);
    const found = await checkCopy(page, rules);
    const hit = found.find((f) => f.rule === rule);
    expect(hit, JSON.stringify(found)).toBeDefined();
    expect(hit?.check).toBe("copy");
    expect(hit?.severity).toBe(rule === "button-length" ? "warn" : "fail");
    expect((hit?.sample ?? "").length).toBeLessThanOrEqual(40);
  });
}

for (const route of ["/", "/properties", "/properties/p1"]) {
  test(`clean ${route} has no copy failures`, async ({ page }) => {
    await page.goto("/sign-in?as=agent");
    await page.goto(`${route}?defect=none`);
    const found = await checkCopy(page, rules);
    expect(found.filter((f) => f.severity === "fail"), JSON.stringify(found)).toEqual([]);
  });
}

test("the case rule skips a row header, which often holds a name, and still checks a column header", async ({ page }) => {
  await page.setContent(`<table><thead><tr><th scope="col">Tenant</th><th scope="col">Monthly Rent</th></tr></thead>
    <tbody><tr><th scope="row">Grace Hopper</th><td>£950</td></tr></tbody></table>`);
  const found = (await checkCopy(page, { caseRule: "sentence" })).filter((f) => f.rule === "case-drift");
  expect(found.map((f) => f.sample)).toEqual(["Monthly Rent"]);
});
