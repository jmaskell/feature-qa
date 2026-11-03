import { expect, test } from "@playwright/test";
import { checkAction, checkDeclaredActions, checkStyled, watchSmoke } from "../../src/checks/smoke.ts";
import { defineQaConfig } from "../../src/config.ts";

test("the clean home page has no smoke findings", async ({ page }) => {
  await page.goto("/?defect=none");
  const watch = await watchSmoke(page);
  await page.goto("/");
  expect([...watch.stop(), ...(await checkStyled(page))]).toEqual([]);
});

for (const [defect, rule] of [["smoke-css", "asset-failed"], ["smoke-console", "console-error"]] as const) {
  test(`${defect} fails with ${rule}`, async ({ page }) => {
    await page.goto(`/?defect=${defect}`);
    const watch = await watchSmoke(page);
    await page.goto("/");
    const found = [...watch.stop(), ...(await checkStyled(page))];
    expect(found.map((f) => f.rule)).toContain(rule);
    for (const f of found) expect(f.message).not.toContain("boom");
  });
}

test("a CSP violation fails with csp-violation, and a second watch does not break", async ({ page }) => {
  await page.goto("/?defect=none");
  await watchSmoke(page).then((w) => w.stop());
  const watch = await watchSmoke(page);
  await page.route("**/csp-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: { "content-security-policy": "img-src 'none'" },
      body: `<html><body><img src="/x.png"></body></html>`,
    }),
  );
  await page.goto("/csp-test");
  await watch.settle();
  expect(watch.stop().map((f) => f.rule)).toContain("csp-violation");
});

test("a dead primary action fails", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=smoke-dead-action");
  const out = await checkAction(page, page.getByRole("button", { name: "Add property" }), "Add property");
  expect(out.map((f) => f.rule)).toEqual(["dead-action"]);
});

test("a live primary action passes", async ({ page }) => {
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=none");
  expect(await checkAction(page, page.getByRole("button", { name: "Add property" }), "Add property")).toEqual([]);
});

test("a state-only toggle is a live action; a button with no handler is dead", async ({ page }) => {
  await page.setContent(`<body><button id="t" aria-pressed="false" onclick="this.setAttribute('aria-pressed', 'true')">Toggle</button><button id="d">Nothing</button></body>`);
  expect(await checkAction(page, page.locator("#t"), "Toggle")).toEqual([]);
  const out = await checkAction(page, page.locator("#d"), "Nothing");
  expect(out.map((f) => f.rule)).toEqual(["dead-action"]);
});

test("smoke-unstyled fails with unstyled and no asset-failed", async ({ page }) => {
  await page.goto("/?defect=smoke-unstyled");
  const watch = await watchSmoke(page);
  await page.goto("/");
  const found = [...watch.stop(), ...(await checkStyled(page))];
  expect(found.map((f) => f.rule)).toEqual(["unstyled"]);
});

test("a page that chooses a serif font first is not unstyled", async ({ page }) => {
  await page.setContent(`<style>body{font-family:"Times New Roman", Georgia, serif}</style><p>Text</p>`);
  expect(await checkStyled(page)).toEqual([]);
});

test("a stylesheet request that a navigation cancels is not asset-failed", async ({ page }) => {
  await page.goto("/?defect=none");
  await page.route("**/slow.css", async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.fulfill({ contentType: "text/css", body: "" }).catch(() => {});
  });
  const watch = await watchSmoke(page);
  await page.evaluate(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "/slow.css";
    document.head.appendChild(l);
  });
  await page.waitForTimeout(300);
  await page.goto("/sign-in");
  await page.waitForTimeout(3200);
  expect(watch.stop().filter((f) => f.rule === "asset-failed")).toEqual([]);
});

test("an aborted stylesheet request is not asset-failed; a failed one is", async ({ page, browserName }) => {
  // Playwright's WebKit gives one errorText ("Blocked by Web Inspector") for every route.abort code.
  test.skip(browserName === "webkit", "route.abort cannot plant a distinct error in WebKit");
  await page.goto("/?defect=none");
  await page.route("**/cancelled.css", (route) => route.abort("aborted"));
  await page.route("**/broken.css", (route) => route.abort("failed"));
  const watch = await watchSmoke(page);
  await page.evaluate(() => {
    for (const href of ["/cancelled.css", "/broken.css"]) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    }
  });
  await page.waitForTimeout(500);
  const found = watch.stop().filter((f) => f.rule === "asset-failed");
  expect(found.map((f) => f.message)).toEqual(["A stylesheet request failed: /broken.css."]);
});

test("a report-only CSP violation is a warning that does not say blocked", async ({ page }) => {
  await page.goto("/?defect=none");
  const watch = await watchSmoke(page);
  await page.route("**/csp-report-only", (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: { "content-security-policy-report-only": "img-src 'none'" },
      body: `<html><body><img src="/x.png" alt=""></body></html>`,
    }),
  );
  await page.goto("/csp-report-only");
  await watch.settle();
  const csp = watch.stop().filter((f) => f.rule === "csp-violation");
  expect(csp.length).toBeGreaterThan(0);
  for (const f of csp) {
    expect(f.severity).toBe("warn");
    expect(f.message).not.toContain("blocked");
  }
});

test("checkDeclaredActions runs only the actions for this route and role", async ({ page }) => {
  const config = defineQaConfig({
    baseURL: "http://localhost:4400", routes: ["/properties"], roles: [{ name: "agent" }], scenarios: [], accessMatrix: {},
    actions: [
      { route: "/properties", role: "agent", selector: "[data-action=add-property]", label: "Add property" },
      { route: "/properties", role: "landlord", selector: "[data-action=nothing]", label: "Not for agents" },
      { route: "/tenants", selector: "[data-action=nothing]", label: "Other page" },
    ],
  });
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties");
  expect(await checkDeclaredActions(page, config, "agent")).toEqual([]);
});

test("checkDeclaredActions reports a declared action that is not on the page", async ({ page }) => {
  const config = defineQaConfig({
    baseURL: "http://localhost:4400", routes: ["/"], roles: [], scenarios: [], accessMatrix: {},
    actions: [{ route: "/", selector: "[data-action=missing]", label: "Missing" }],
  });
  await page.goto("/");
  const found = await checkDeclaredActions(page, config, "anonymous");
  expect(found.map((f) => [f.check, f.rule, f.severity])).toEqual([["smoke", "action-missing", "fail"]]);
});

test("checkDeclaredActions reports a declared action that cannot take a click, and does not throw", async ({ page }) => {
  test.setTimeout(15_000);
  const config = defineQaConfig({
    baseURL: "http://localhost:4400", routes: ["/properties"], roles: [{ name: "agent" }], scenarios: [], accessMatrix: {},
    actions: [{ route: "/properties", role: "agent", selector: "[data-action=add-property]", label: "Add property" }],
  });
  await page.goto("/sign-in?as=agent");
  await page.goto("/properties?defect=smoke-action-hidden");
  const found = await checkDeclaredActions(page, config, "agent");
  expect(found.map((f) => [f.check, f.rule, f.severity])).toEqual([["smoke", "action-not-clickable", "fail"]]);
  expect(found[0]!.message).toContain("Add property");
});
