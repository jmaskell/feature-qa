import { expect, test } from "@playwright/test";
import { checkLayout } from "../../src/checks/layout.ts";
import { collectElements, collectText } from "../../src/collect.ts";

test.beforeEach(async ({ page }) => { await page.goto("/sign-in?as=agent"); await page.goto("/properties?defect=none"); });

test("collects the visible buttons with their styles", async ({ page }) => {
  const els = await collectElements(page);
  const add = els.find((e) => e.name === "Add property");
  expect(add?.interactive).toBe(true);
  expect(add?.style.cursor).toBe("pointer");
  expect(add?.attributes["data-slot"]).toBe("button");
  expect(typeof add?.style.textOverflow).toBe("string");
  expect(typeof add?.style.display).toBe("string");
  expect(add?.selector).toMatch(/^body > .*button:nth-child\(\d+\)$/);
  expect(add?.box.width).toBeGreaterThan(0);
});

test("skips hidden elements", async ({ page }) => {
  const els = await collectElements(page);
  expect(els.some((e) => e.attributes.class === "raw")).toBe(false);
  const { text } = await collectText(page);
  expect(text.join(" ")).not.toContain("3f2b9c1e");
});

test("collects the title and the accessible names", async ({ page }) => {
  const { title, names } = await collectText(page);
  expect(title).toBe("Properties — Harbour Lettings");
  expect(names).toContain("Add property");
});

test("skips aria-hidden, display none, visibility hidden and off-page elements", async ({ page }) => {
  await page.evaluate(() => {
    const h = (html: string) => document.body.insertAdjacentHTML("beforeend", html);
    h('<div aria-hidden="true"><button id="t-aria">AriaHid</button></div>');
    h('<button id="t-none" style="display:none">NoneHid</button>');
    h('<button id="t-vis" style="visibility:hidden">VisHid</button>');
    h('<button id="t-off" style="position:absolute;left:-5000px">OffPage</button>');
    h('<button id="t-ok">ShownOk</button>');
  });
  const els = await collectElements(page);
  const names = els.map((e) => e.name);
  expect(names).toContain("ShownOk");
  for (const n of ["AriaHid", "NoneHid", "VisHid", "OffPage"]) expect(names).not.toContain(n);
  const { text } = await collectText(page);
  expect(text).toContain("ShownOk");
  expect(text).not.toContain("AriaHid");
});

test("returns plain JSON", async ({ page }) => {
  const els = await collectElements(page);
  expect(JSON.parse(JSON.stringify(els))).toEqual(els);
});

test("a focusable scroll region and a bare focusable div are not interactive, widget roles are", async ({ page }) => {
  await page.setContent(`<div id="r" tabindex="0" role="region" aria-label="Scroll area">x</div>
    <div id="d" tabindex="0" aria-label="Bare">y</div>
    <div id="lb" tabindex="0" role="listbox" aria-label="Choices">z</div>
    <div id="tl" tabindex="0" role="tablist" aria-label="Tabs">w</div>`);
  const els = await collectElements(page);
  const at = (id: string) => els.find((e) => e.selector.includes(`#${id}`) || e.attributes["aria-label"] === { r: "Scroll area", d: "Bare", lb: "Choices", tl: "Tabs" }[id]);
  for (const id of ["r", "d"]) expect(at(id)?.interactive, id).toBe(false);
  for (const id of ["lb", "tl"]) expect(at(id)?.interactive, id).toBe(true);
});

test("keeps the type attribute of an input", async ({ page }) => {
  await page.setContent(`<input type="checkbox" aria-label="Agree">`);
  const els = await collectElements(page);
  expect(els.find((e) => e.tag === "input")?.attributes.type).toBe("checkbox");
});

test("each element has the selector of its fixed or sticky layer", async ({ page }) => {
  await page.setContent(`<main><a href="#a">Flow</a></main>
    <footer style="position:sticky;bottom:0"><div><a href="#b">In the bar</a></div></footer>`);
  const els = await collectElements(page);
  const layer = (text: string) => els.find((e) => e.text === text)?.layer;
  expect(layer("Flow")).toBeNull();
  expect(layer("In the bar")).toBe("body > footer:nth-child(2)");
});

test("a link in a sticky bar over a field is not an overlap; two links that cross in the bar are", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 300 });
  await page.setContent(`<style>a,button{cursor:pointer;display:inline-block;width:120px;height:30px}</style>
    <form><div style="height:600px"></div><button type="button">Under the bar</button><div style="height:400px"></div></form>
    <footer style="position:sticky;bottom:0;background:#fff;height:40px"><a href="#a">Save</a><a href="#b" style="margin-left:-60px">Cancel</a></footer>`);
  await page.evaluate(() => window.scrollTo(0, 450)); // the bar now sits over the button
  const overlaps = (await checkLayout(page)).filter((f) => f.rule === "overlap");
  expect(overlaps.map((f) => f.selector)).toEqual(["body > footer:nth-child(2) > a:nth-child(2)"]);
});
