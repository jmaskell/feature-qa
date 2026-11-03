import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { checkAccess } from "../../src/checks/access.ts";
import { checkEscape } from "../../src/checks/interaction.ts";
import { watchLeaks } from "../../src/checks/leaks.ts";
import { checkDeclaredActions, watchSmoke } from "../../src/checks/smoke.ts";
import { defineQaConfig } from "../../src/config.ts";
import { runPageChecks } from "../../src/run-checks.ts";
import type { CheckId, Finding } from "../../src/types.ts";
// @ts-expect-error The fixture is plain JavaScript and has no types.
import { DEFECTS } from "../../../../fixtures/lettings-app/defects.mjs";
// @ts-expect-error The fixture is plain JavaScript and has no types.
import { KNOWN_VALUES } from "../../../../fixtures/lettings-app/seed.mjs";

interface Defect { id: string; check: CheckId; rule: string; route: string; role?: string; alsoFails?: CheckId[] }

const BASE = "http://localhost:4400";
const WIDTHS = [375, 1280];

const config = defineQaConfig({
  baseURL: BASE,
  routes: ["/", "/sign-in", "/properties", "/properties/p1", "/properties/p2", "/properties/p3", "/tenants", "/report"],
  roles: ["agent", "landlord"].map((name) => ({
    name,
    signIn: async (page: Page) => { await page.goto(`/sign-in?as=${name}`); },
  })),
  scenarios: [{ name: "lettings", states: ["default"], knownValues: KNOWN_VALUES as string[] }],
  accessMatrix: {
    "/": { agent: "allow", landlord: "allow", anonymous: "allow" },
    "/sign-in": { agent: "allow", landlord: "allow", anonymous: "allow" },
    "/report": { agent: "allow", landlord: "allow", anonymous: "allow" },
    "/properties": { agent: "allow", landlord: "allow" },
    "/properties/p1": { agent: "allow" },
    "/properties/p2": { agent: "allow", landlord: "allow" },
    "/properties/p3": { agent: "allow" },
    "/tenants": { agent: "allow" },
  },
  designSystem: {
    componentMarker: "[data-ds]",
    maxVariants: { button: 2, link: 1 },
    variantAttribute: "data-variant",
    requiredRootAttributes: { "data-brand": "lettings" },
    typeScale: [[16, 400], [32, 600], [24, 600], [14, 400], [16, 600]],
  },
  actions: [{ route: "/properties", role: "agent", selector: "[data-action=add-property]", label: "Add property" }],
  copy: { bannedTerms: ["seamless"], maxButtonWords: 4, emptyValueWord: "None", caseRule: "sentence", properNouns: ["Harbour Lettings"] },
});

const withDefect = (id: string) => async (context: import("@playwright/test").BrowserContext) => {
  await context.addCookies([{ name: "qa_defect", value: id, url: BASE }]);
};

const serverLog = () => fetch(`${BASE}/__log`).then((r) => r.text());

/** Run every check that applies to one route, as one role, at one width. */
async function runAllChecks(page: Page, route: string, role: string | undefined, defect: string): Promise<Finding[]> {
  const context = page.context();
  await withDefect(defect)(context);
  if (role) await page.goto(`/sign-in?as=${role}`);
  const smoke = await watchSmoke(page);
  const leaks = await watchLeaks(page, { values: KNOWN_VALUES as string[], ownOrigins: [BASE], serverLog });
  const found: Finding[] = [];
  // The ?defect query makes the fixture redirect. The leaks-url defect needs that redirect.
  await page.goto(defect === "none" ? route : `${route}?defect=${defect}`);
  await page.waitForLoadState("networkidle");
  // The page checks include the unstyled rule (smoke) and reflow (a11y).
  found.push(...(await runPageChecks(page, config)));
  // The page checks must run before the actions below, which change the page.
  found.push(...(await checkDeclaredActions(page, config, role ?? "anonymous")));
  if (role === "agent" && route === "/properties/p1") {
    await page.goto(route);
    found.push(...(await checkEscape(page, () => page.getByRole("button", { name: "Message tenant" }).click())));
  }
  await smoke.settle();
  found.push(...smoke.stop());
  found.push(...(await leaks.stop()));
  return found;
}

const failedChecks = (found: Finding[]) => new Set(found.filter((f) => f.severity === "fail").map((f) => f.check));
const describeFails = (found: Finding[]) =>
  found.filter((f) => f.severity === "fail").map((f) => `${f.check}/${f.rule} ${f.route ?? ""} ${f.selector ?? ""}`);

// The button-length rule is a warning by design, so its defect cannot produce a failure.
// For these defects the own check must report the named warning. Other checks must still not fail.
const WARN_ONLY = new Set(["copy-button-length"]);

test.describe("defects", () => {
  test.setTimeout(120_000);
  for (const defect of DEFECTS as Defect[]) {
    test(defect.id, async ({ page, browser }) => {
      const all: Finding[] = [];
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 800 });
        all.push(...(await runAllChecks(page, defect.route, defect.role, defect.id)));
      }
      if (defect.check === "access") {
        all.push(...(await checkAccess(browser, config, { beforeEach: withDefect(defect.id) })));
      }
      const failed = failedChecks(all);
      const detail = describeFails(all);
      const severity = WARN_ONLY.has(defect.id) ? "warn" : "fail";
      const hit = all.some((f) => f.check === defect.check && f.rule === defect.rule && f.severity === severity);
      expect(hit, `${defect.id} must give a ${severity} ${defect.check}/${defect.rule}. Fails: ${detail.join("; ")}`).toBe(true);
      const allowed = new Set<CheckId>([defect.check, ...(defect.alsoFails ?? [])]);
      const extra = [...failed].filter((c) => !allowed.has(c));
      expect(extra, `${defect.id} failed other checks: ${detail.join("; ")}`).toEqual([]);
    });
  }
});

// Every allowed cell of the access matrix is a clean route for that role.
const CLEAN = Object.entries(config.accessMatrix).flatMap(([route, byRole]) =>
  Object.entries(byRole).filter(([, result]) => result === "allow").map(([role]) => ({ route, role: role === "anonymous" ? undefined : role })),
);

test.describe("clean app", () => {
  test.setTimeout(60_000);
  for (const { role, route } of CLEAN) {
    for (const width of WIDTHS) {
      test(`${role ?? "signed-out"} ${route} at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        const found = await runAllChecks(page, route, role, "none");
        expect(describeFails(found)).toEqual([]);
      });
    }
  }

  test("access matrix", async ({ browser }) => {
    const found = await checkAccess(browser, config);
    expect(describeFails(found)).toEqual([]);
  });
});
