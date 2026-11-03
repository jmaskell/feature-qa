import { expect, test } from "@playwright/test";
import { checkEscape, checkInteraction } from "../../src/checks/interaction.ts";

test.beforeEach(async ({ page }) => { await page.goto("/sign-in?as=agent"); });

test("clean /properties gives no findings", async ({ page }) => {
  await page.goto("/properties?defect=none");
  const start = Date.now();
  const found = await checkInteraction(page);
  console.log(`clean /properties run time: ${Date.now() - start} ms`);
  expect(found).toEqual([]);
});

const cases = [
  ["interaction-cursor", "pointer-cursor"],
  ["interaction-focus", "focus-visible"],
  ["interaction-hover-shift", "hover-shift"],
] as const;

for (const [defect, rule] of cases) {
  test(`${defect} fails with ${rule}`, async ({ page }) => {
    await page.goto(`/properties?defect=${defect}`);
    const found = await checkInteraction(page);
    expect(found.map((f) => f.rule)).toContain(rule);
    expect(found.every((f) => f.check === "interaction" && f.severity === "fail")).toBe(true);
  });
}

test("interaction-escape fails with escape-closes", async ({ page }) => {
  await page.goto("/properties/p1?defect=interaction-escape");
  const found = await checkEscape(page, () => page.getByRole("button", { name: "Message tenant" }).click());
  expect(found.map((f) => f.rule)).toEqual(["escape-closes"]);
});

test("clean dialog closes on Escape", async ({ page }) => {
  await page.goto("/properties/p1?defect=none");
  const found = await checkEscape(page, () => page.getByRole("button", { name: "Message tenant" }).click());
  expect(found).toEqual([]);
});

test("a covered button is skipped without a throw", async ({ page }) => {
  await page.setContent(`<style>.btn{cursor:pointer}</style>
    <button class="btn" id="a">Covered</button><button class="btn" id="b">Normal</button>
    <div style="position:fixed;left:0;top:0;width:150px;height:60px;background:#fff"></div>`);
  await page.evaluate(() => { document.getElementById("a")!.style.cssText = "position:fixed;left:10px;top:10px"; });
  const start = Date.now();
  const found = await checkInteraction(page);
  expect(Date.now() - start).toBeLessThan(10_000);
  expect(found.filter((f) => f.rule === "hover-shift")).toEqual([]);
});

test("hover shift flags only the shifting rows, not their neighbours", async ({ page }) => {
  await page.setContent(`<style>
    ul{margin:0;padding:0;list-style:none} li{padding:4px;cursor:pointer}
    #calm li{transition:background 100ms} #calm li:hover{background:#eee}
    #shift li{transition:padding 100ms} #shift li:hover{padding-block:12px}
    a{cursor:pointer}a:focus-visible{outline:2px solid blue}</style>
    <ul id="calm"><li><a href="#c1">One</a></li><li><a href="#c2">Two</a></li></ul>
    <ul id="shift"><li><a href="#s1">Three</a></li><li><a href="#s2">Four</a></li></ul>`);
  const found = (await checkInteraction(page)).filter((f) => f.rule === "hover-shift");
  expect(found.length).toBeGreaterThan(0);
  for (const f of found) expect(f.selector).toContain("ul:nth-child(2)");
});

test("an opener that opens nothing gives a warning", async ({ page }) => {
  await page.goto("/properties?defect=none");
  const found = await checkEscape(page, async () => {});
  expect(found.map((f) => [f.rule, f.severity])).toEqual([["escape-nothing-open", "warn"]]);
});

test("a checkbox, a submit and a range with the default cursor fail; text entry does not", async ({ page }) => {
  await page.setContent(`<style>input{cursor:default}</style>
    <input type="checkbox" aria-label="Agree"><input type="submit" value="Send"><input type="range" aria-label="Level">
    <input type="text" aria-label="Name"><input type="date" aria-label="Day"><textarea aria-label="Note"></textarea>`);
  const found = (await checkInteraction(page)).filter((f) => f.rule === "pointer-cursor");
  expect(found.map((f) => f.selector)).toEqual([
    "body > input:nth-child(1)", "body > input:nth-child(2)", "body > input:nth-child(3)",
  ]);
});

test("a focusable tree item with the default cursor is not a pointer-cursor fail", async ({ page }) => {
  await page.setContent(`<ul role="tree" aria-label="Files"><li role="treeitem" tabindex="0" aria-selected="true">Leases</li><li role="treeitem" tabindex="-1">Deposits</li></ul>`);
  expect((await checkInteraction(page)).filter((f) => f.rule === "pointer-cursor")).toEqual([]);
});

test("a focusable tab panel and a focusable pre are not controls", async ({ page }) => {
  await page.setContent(`<div role="tabpanel" tabindex="0" aria-label="Panel">Panel text</div><pre tabindex="0">code</pre>`);
  expect((await checkInteraction(page)).filter((f) => f.rule === "pointer-cursor")).toEqual([]);
});

test("a control that has focus at load is not a focus-visible false positive", async ({ page }) => {
  await page.setContent(`<style>button{cursor:pointer} button:focus-visible{outline:2px solid blue}</style>
    <button id="a">One</button><button>Two</button><script>document.getElementById("a").focus()</script>`);
  expect((await checkInteraction(page)).filter((f) => f.rule === "focus-visible")).toEqual([]);
});

test("controls that take no focus give the focus-unreachable warning", async ({ page }) => {
  await page.setContent(`<style>button{cursor:pointer}</style><div inert><button>One</button><button>Two</button></div>`);
  const found = (await checkInteraction(page)).filter((f) => f.rule.startsWith("focus"));
  expect(found.map((f) => [f.rule, f.severity])).toEqual([["focus-unreachable", "warn"]]);
});

const DIALOG = `<style>button{cursor:pointer}</style>
  <button id="open" onclick="document.getElementById('d').showModal()">Open</button>
  <dialog id="d" aria-label="Message"><p>Hello</p></dialog>`;

test("a dialog that was open before the action does not count", async ({ page }) => {
  await page.setContent(`<div role="dialog" aria-label="Cookies" style="position:fixed;bottom:0">Cookies are used.</div>${DIALOG}`);
  expect(await checkEscape(page, () => page.locator("#open").click())).toEqual([]);
});

test("a dialog with a 300 ms exit animation passes", async ({ page }) => {
  await page.setContent(`${DIALOG}<script>
    const d = document.getElementById("d");
    d.addEventListener("cancel", (e) => { e.preventDefault(); setTimeout(() => d.close(), 300); });
  </script>`);
  expect(await checkEscape(page, () => page.locator("#open").click())).toEqual([]);
});

test("a focus ring that fades in with a transition passes", async ({ page }) => {
  await page.setContent(`<style>button{cursor:pointer;outline:none} button:focus-visible{box-shadow:0 0 0 3px #036;transition:box-shadow 300ms}</style>
    <button>One</button><button>Two</button>`);
  // WebKit draws native buttons without a box shadow, so this case runs on Chromium only.
  test.skip(test.info().project.name === "webkit", "WebKit gives no box shadow to a native button.");
  expect((await checkInteraction(page)).filter((f) => f.rule.startsWith("focus"))).toEqual([]);
});

test("a focus ring that a script adds one task after the focus passes", async ({ page }) => {
  await page.setContent(`<style>button{cursor:pointer;outline:none} button.ring{outline:2px solid #036}</style>
    <button>One</button><button>Two</button>
    <script>for (const b of document.querySelectorAll("button")) {
      b.addEventListener("focus", () => setTimeout(() => b.classList.add("ring"), 0));
      b.addEventListener("blur", () => setTimeout(() => b.classList.remove("ring"), 0));
    }</script>`);
  expect((await checkInteraction(page)).filter((f) => f.rule.startsWith("focus"))).toEqual([]);
});

test("a hover shift behind a 400 ms transition fails", async ({ page }) => {
  await page.setContent(`<style>a{cursor:pointer;display:inline-block;padding:4px;transition:padding 400ms} a:hover{padding:12px} a:focus-visible{outline:2px solid blue}</style>
    <a href="#a">Grows</a>`);
  expect((await checkInteraction(page)).map((f) => f.rule)).toContain("hover-shift");
});

test("a hover shift that a script makes one task after mouseenter fails", async ({ page }) => {
  await page.setContent(`<style>a{cursor:pointer} a:focus-visible{outline:2px solid blue} .more{display:none} li.on .more{display:block}</style>
    <ul><li><a href="#a">Row</a><span class="more">Edit</span></li></ul>
    <script>const li = document.querySelector("li");
      li.addEventListener("mouseenter", () => setTimeout(() => li.classList.add("on"), 0));
      li.addEventListener("mouseleave", () => setTimeout(() => li.classList.remove("on"), 0));</script>`);
  expect((await checkInteraction(page)).map((f) => f.rule)).toContain("hover-shift");
});

test("a hover shift on a row that is half below the fold fails", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 400 });
  await page.setContent(`<style>body{margin:0} a{cursor:pointer;display:block;height:120px} a:focus-visible{outline:2px solid blue}
    li{list-style:none} li:hover{padding-top:8px}</style>
    <div style="height:340px"></div><ul style="margin:0;padding:0"><li><a href="#a">Row</a></li></ul>`);
  expect((await checkInteraction(page)).map((f) => f.rule)).toContain("hover-shift");
});

test("below the fold, a hover shift fails on the shifting control only, in a group read and after a second scroll", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 400 });
  // Two groups below the fold: links 1–6 after one spacer, links 7–12 after a second one. Links 4 and 10 grow on hover.
  const links = (from: number) => Array.from({ length: 6 }, (_, k) => `<a id="l${from + k}" href="#${from + k}">Link ${from + k}</a>`).join("");
  await page.setContent(`<style>body{margin:0} a{cursor:pointer;display:block;height:40px} a:focus-visible{outline:2px solid blue}
    #l4:hover, #l10:hover{padding-top:6px}</style>
    <div style="height:900px"></div>${links(1)}<div style="height:900px"></div>${links(7)}`);
  const found = (await checkInteraction(page)).filter((f) => f.rule === "hover-shift").map((f) => f.selector);
  // The selectors are paths: the spacer is child 1, links 1–6 are children 2–7, the second spacer is 8, links 7–12 are 9–14.
  expect(found).toEqual(["body > a:nth-child(5)", "body > a:nth-child(12)"]);
});
