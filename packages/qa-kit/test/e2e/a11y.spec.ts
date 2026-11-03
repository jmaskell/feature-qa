import { expect, test } from "@playwright/test";
import { checkA11y, checkForcedColors, checkReflow } from "../../src/checks/a11y.ts";

test("clean /properties has no a11y findings", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=none");
  expect(await checkA11y(page)).toEqual([]);
});

test("clean /properties has no reflow findings and keeps the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=none");
  expect(await checkReflow(page)).toEqual([]);
  expect(page.viewportSize()).toEqual({ width: 1280, height: 800 });
});

test("reflow gives a warning and changes nothing when the viewport is null", async ({ browser }) => {
  const context = await browser.newContext({ viewport: null, deviceScaleFactor: undefined });
  const page = await context.newPage();
  await page.goto("http://localhost:4400/");
  const found = await checkReflow(page);
  expect(found.map((f) => [f.rule, f.severity])).toEqual([["reflow-skipped", "warn"]]);
  expect(page.viewportSize()).toBeNull();
  await context.close();
});

test("a11y-name gives axe-button-name without page text", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=a11y-name");
  const found = await checkA11y(page);
  const hit = found.find((f) => f.rule === "axe-button-name");
  expect(hit).toBeDefined();
  expect(hit?.check).toBe("a11y");
  expect(hit?.severity).toBe("fail");
  expect(hit?.selector).toBeTruthy();
  expect(hit?.sample).toBeUndefined();
});

test("layout-overflow fails reflow", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=layout-overflow");
  const found = await checkReflow(page);
  expect(found.map((f) => f.rule)).toContain("reflow");
});

test("checkReflow keeps an open dialog", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties/p1?defect=none");
  await page.getByRole("button", { name: "Message tenant" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await checkReflow(page)).toEqual([]);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("exclude removes the a11y-name finding", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=a11y-name");
  const hit = (await checkA11y(page)).find((f) => f.rule === "axe-button-name");
  expect(hit?.selector).toBeTruthy();
  const after = await checkA11y(page, { exclude: [hit!.selector!] });
  expect(after.map((f) => f.rule)).not.toContain("axe-button-name");
});

test("forced colours: a control with only a background colour disappears", async ({ page }) => {
  await page.setContent(`
    <button id="bg" aria-label="Map" style="width:44px;height:44px;border:0;background:#0a6"></button>
    <button id="text" style="border:0;background:#0a6">Save</button>
    <button id="border" aria-label="Map" style="width:44px;height:44px;border:1px solid transparent;background:#0a6"></button>
    <button id="icon" aria-label="Map" style="border:0;background:#0a6"><svg width="20" height="20" aria-hidden="true"><rect width="20" height="20"/></svg></button>
    <button id="opt-out" aria-label="Map" style="width:44px;height:44px;border:0;background:#0a6;forced-color-adjust:none"></button>
    <input id="field" aria-label="Name" style="border:0;background:#eee">`);
  // WebKit does not support forced-color-adjust, so it reads the value as auto and reports #opt-out.
  // The opt-out case is Chromium-only; WebKit runs the test without it.
  if (test.info().project.name === "webkit") await page.locator("#opt-out").evaluate((el) => el.remove());
  const found = await checkForcedColors(page);
  expect(found.map((f) => [f.rule, f.severity])).toEqual([["forced-colors", "fail"]]);
  expect(found[0]?.selector).toContain("button:nth-child(1)");
});

// A page whose iframe holds a button with no name. The route serves both documents.
async function framed(page: import("@playwright/test").Page, frameUrl: string) {
  await page.route(frameUrl, (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><title>Inner</title><main><button></button></main></html>` }));
  await page.route("http://localhost:4400/framed", (r) => r.fulfill({ contentType: "text/html",
    body: `<!doctype html><html lang="en"><title>Outer</title><main><h1>Outer</h1><iframe title="Inner" src="${frameUrl}"></iframe></main></html>` }));
  await page.goto("http://localhost:4400/framed");
  await page.frameLocator("iframe").locator("button").waitFor({ state: "attached" });
}

test("axe reads a same-origin iframe", async ({ page }) => {
  await framed(page, "http://localhost:4400/framed-inner");
  expect((await checkA11y(page)).map((f) => f.rule)).toContain("axe-button-name");
});

test("axe reads a cross-origin iframe", async ({ page }) => {
  await framed(page, "http://127.0.0.1:4401/framed-inner");
  expect((await checkA11y(page)).map((f) => f.rule)).toContain("axe-button-name");
});
