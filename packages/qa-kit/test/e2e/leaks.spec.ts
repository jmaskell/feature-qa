import { expect, test } from "@playwright/test";
import { watchLeaks } from "../../src/checks/leaks.ts";
// @ts-expect-error The fixture is plain JavaScript and has no types.
import { KNOWN_VALUES } from "../../../../fixtures/lettings-app/seed.mjs";

const opts = {
  values: KNOWN_VALUES as string[],
  ownOrigins: ["http://localhost:4400"],
  serverLog: () => fetch("http://localhost:4400/__log").then((r) => r.text()),
};

const cases: Array<[string, string, string, string]> = [
  ["leaks-url", "/properties/p1", "url", "/properties"],
  ["leaks-title", "/properties/p1", "title", ""],
  ["leaks-storage", "/properties/p1", "storage", ""],
  ["leaks-third-party", "/report", "third-party", ""],
  ["leaks-log", "/properties/p1", "server-log", ""],
];

for (const [defect, route, rule] of cases) {
  test(`${defect} gives ${rule}`, async ({ page }) => {
    await page.goto("/sign-in?as=agent");
    const watch = await watchLeaks(page, opts);
    await page.goto(`${route}?defect=${defect}`);
    await page.waitForLoadState("networkidle");
    const found = await watch.stop();
    expect(found.map((f) => f.rule)).toContain(rule);
    for (const f of found) {
      expect(f.check).toBe("leaks");
      expect(f.severity).toBe("fail");
      for (const v of KNOWN_VALUES) expect(f.sample ?? "").not.toContain(v);
    }
  });
}

test("leaks-url also fires from the list links", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=leaks-url");
  const watch = await watchLeaks(page, opts);
  await page.getByRole("link", { name: /Harbour Row/ }).first().click();
  await page.waitForLoadState("networkidle");
  expect((await watch.stop()).map((f) => f.rule)).toContain("url");
});

test("clean /properties/p1 has no leaks, though the body shows the tenant", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  const watch = await watchLeaks(page, opts);
  await page.goto("/properties/p1?defect=none");
  await page.waitForLoadState("networkidle");
  expect(await watch.stop()).toEqual([]);
});

test("a storage key with a personal value is masked in the sample", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  const watch = await watchLeaks(page, opts);
  await page.goto("/properties/p1?defect=none");
  await page.evaluate(() => localStorage.setItem("tenant:grace.hopper@example.test", "07700 900201"));
  const found = await watch.stop();
  expect(found.map((f) => f.rule)).toContain("storage");
  for (const f of found) for (const v of [...KNOWN_VALUES as string[], "grace.hopper@example.test"]) expect(f.sample ?? "").not.toContain(v);
  expect(await watch.stop()).toEqual(found);
});

test("leaks-cookie: an HttpOnly cookie with a personal value gives cookie", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  const watch = await watchLeaks(page, opts);
  await page.goto("/properties/p1?defect=leaks-cookie");
  const found = await watch.stop();
  expect(found.map((f) => f.rule)).toContain("cookie");
  for (const f of found) expect(f.sample ?? "").not.toContain("grace.hopper@example.test");
});

test("a title set before a same-document navigation is found", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties/p1?defect=none");
  const watch = await watchLeaks(page, opts);
  await page.evaluate(() => { document.title = "Grace Hopper"; history.pushState({}, "", "/properties/p1/tenant"); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.title = "Property details"; });
  expect((await watch.stop()).map((f) => f.rule)).toContain("title");
});

test("a title that the caller adds is scanned", async ({ page }) => {
  await page.goto("/?defect=none");
  const watch = await watchLeaks(page, opts);
  watch.addTitle("Zoë Brontë-Okafor — Harbour Lettings");
  expect((await watch.stop()).map((f) => f.rule)).toEqual(["title"]);
});

test("the raw query string is scanned, so a + in a value is found", async ({ page }) => {
  await page.goto("/?defect=none");
  const watch = await watchLeaks(page, { ...opts, values: ["grace+qa@example.test"] });
  await page.goto("/?e=grace+qa@example.test");
  expect((await watch.stop()).map((f) => f.rule)).toContain("url");
});
