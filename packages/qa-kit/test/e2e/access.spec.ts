import { expect, test } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import { checkAccess } from "../../src/checks/access.ts";
import { defineQaConfig } from "../../src/config.ts";

const config = defineQaConfig({
  baseURL: "http://localhost:4400",
  routes: ["/properties", "/tenants", "/properties/p3"],
  scenarios: [],
  roles: ["agent", "landlord"].map((name) => ({
    name,
    signIn: async (page) => { await page.goto(`/sign-in?as=${name}`); },
  })),
  accessMatrix: {
    "/properties": { agent: "allow", landlord: "allow" },
    "/tenants": { agent: "allow" },
    "/properties/p3": { agent: "allow" },
  },
});

const withDefect = (id: string) => async (context: BrowserContext) => {
  await context.addCookies([{ name: "qa_defect", value: id, url: "http://localhost:4400" }]);
};

test("clean app has no access findings", async ({ browser }) => {
  expect(await checkAccess(browser, config)).toEqual([]);
});

test("access-landlord-tenants gives denied-but-allowed", async ({ browser }) => {
  const found = await checkAccess(browser, config, { beforeEach: withDefect("access-landlord-tenants") });
  const hit = found.find((f) => f.rule === "denied-but-allowed");
  expect(hit).toMatchObject({ check: "access", severity: "fail", route: "/tenants" });
  expect(hit?.message).toContain("landlord");
});

test("access-idor gives denied-but-allowed", async ({ browser }) => {
  const found = await checkAccess(browser, config, { beforeEach: withDefect("access-idor") });
  const hit = found.find((f) => f.rule === "denied-but-allowed" && f.route === "/properties/p3");
  expect(hit).toBeDefined();
  expect(hit?.message).toContain("landlord");
});

// A config whose roles count their sign-ins. Each sign-in also sets a session id cookie, so a test can end that session.
function counted() {
  const signIns: string[] = [];
  let next = 0;
  const roles = config.roles.map((r) => ({
    name: r.name,
    signIn: async (page: import("@playwright/test").Page) => {
      signIns.push(r.name);
      await r.signIn!(page);
      await page.context().addCookies([{ name: "sid", value: `${r.name}-${(next += 1)}`, url: "http://localhost:4400" }]);
    },
  }));
  return { config: { ...config, roles }, signIns };
}

// A server-side session store in front of the fixture: a landlord session ends when it opens /properties.
// The store answers a request with an ended session with 403, as an app answers a signed-out visitor.
function endLandlordSessionOnProperties(defect?: string) {
  const ended = new Set<string>();
  return async (context: BrowserContext) => {
    if (defect) await withDefect(defect)(context);
    await context.route("http://localhost:4400/**", async (route) => {
      const sid = (await context.cookies()).find((c) => c.name === "sid")?.value;
      if (sid && ended.has(sid)) return route.fulfill({ status: 403, contentType: "text/html", body: "<h1>Signed out</h1>" });
      // The app answers this request with the session as it was. Later requests see the session ended.
      if (sid?.startsWith("landlord-") && new URL(route.request().url()).pathname === "/properties") ended.add(sid);
      return route.continue();
    });
  };
}

test("each role signs in once on the clean app", async ({ browser }) => {
  const { config: c, signIns } = counted();
  expect(await checkAccess(browser, c)).toEqual([]);
  expect(signIns).toEqual(["agent", "landlord"]);
});

test("reuseSignIn false signs in for every probe", async ({ browser }) => {
  const { config: c, signIns } = counted();
  expect(await checkAccess(browser, c, { reuseSignIn: false })).toEqual([]);
  expect(signIns).toHaveLength(6);
});

test("a session that ends during the check gives no false finding", async ({ browser }) => {
  const { config: c } = counted();
  expect(await checkAccess(browser, c, { beforeEach: endLandlordSessionOnProperties() })).toEqual([]);
});

test("a session that ends during the check does not hide denied-but-allowed", async ({ browser }) => {
  // The landlord's first probe opens /properties and ends the session. With the session reused, /tenants would see
  // a signed-out visitor and look denied. The witness route shows that the session ended, so the probe signs in again.
  const { config: c } = counted();
  const found = await checkAccess(browser, c, { beforeEach: endLandlordSessionOnProperties("access-landlord-tenants") });
  expect(found).toEqual([expect.objectContaining({ rule: "denied-but-allowed", route: "/tenants", severity: "fail" })]);
  expect(found[0]?.message).toContain("landlord");
});

test("a probe that throws becomes a probe-error failure", async ({ browser }) => {
  const bad = { ...config, roles: [{ name: "agent", signIn: async () => { throw new Error("boom"); } }], routes: ["/properties"], accessMatrix: {} };
  const found = await checkAccess(browser, bad);
  const errors = found.filter((f) => f.rule === "probe-error" && f.route === "/properties" && f.message.includes('"agent"'));
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatchObject({ severity: "fail" });
});
