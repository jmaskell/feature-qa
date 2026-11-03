// The feature-qa adapter: the one file that tells the kit about this project.
// Copy it to the project root as qa.config.ts. Replace each placeholder with a fact of the project.
// Remove an optional block that the project does not need.
import type { Page } from "@playwright/test";
import { defineQaConfig } from "@feature-qa/kit";

export default defineQaConfig({
  // The address of the local or test app. Never a hosted production system.
  baseURL: "http://localhost:3000",

  // Every path that the access check opens as each role and as a signed-out visitor.
  routes: ["/", "/items", "/items/1"],

  // The roles that sign in. The name "anonymous" is reserved for the signed-out visitor.
  roles: [
    {
      name: "editor",
      // How a test signs in as this role. Use a test-only sign-in, never a real account.
      signIn: async (page: Page) => { await page.goto("/test-sign-in?as=editor"); },
    },
  ],

  // The seed scenarios. knownValues are the fake personal values that the leak scan looks for.
  scenarios: [{ name: "default-seed", states: ["default"], knownValues: ["Example Person", "person@example.test"] }],

  // route → role → "allow" or "deny". A missing cell means "deny".
  accessMatrix: {
    "/": { editor: "allow", anonymous: "allow" },
    "/items": { editor: "allow" },
    "/items/1": { editor: "allow" },
  },

  // Optional. The design-system rules of the conformance check.
  designSystem: {
    componentMarker: "[data-component]",            // matches the root of a design-system control
    // interactiveSelector: "button, a[href]",       // what counts as a control; the kit has a default
    maxVariants: { button: 2 },                     // component name → the number of variants allowed on one page
    variantAttribute: "data-variant",               // holds "<component>:<variant>", or only the variant when componentAttribute names the component
    componentAttribute: "data-slot",                // holds the component name
    typeScale: [[16, 400], [24, 600]],              // the allowed [font size in px, font weight] pairs
    requiredRootAttributes: { "data-theme": "light" }, // attributes that the root element must have
  },

  // Optional. The rules of the copy check.
  copy: {
    bannedTerms: ["seamless"],                      // words that must not show on a page
    maxButtonWords: 4,                              // the most words in one button label
    emptyValueWord: "None",                         // the one word for an empty value
    emptyValueVariants: ["N/A", "Unknown"],         // words that mean "empty"; the kit has a default list
    caseRule: "sentence",                           // the case of labels: "sentence" or "title"
    properNouns: ["Example Company"],               // words that keep their capitals
    rulesFile: "copy-rules.md",                     // the project's copy rules; the copy judge reads it
  },

  // Optional. Other origins that count as this app for the leak scan.
  ownOrigins: ["http://localhost:3001"],

  // Optional. The primary actions. qa.step clicks them when it gets actionsAs.
  actions: [{ route: "/items", role: "editor", selector: "[data-action=add-item]", label: "Add item" }],

  // Optional. Known findings to drop. Each entry needs a reason.
  ignore: [{ check: "a11y", rule: "color-contrast", selector: "[data-component=chart]", reason: "The chart has a text table below it." }],

  // Optional. CSS selectors that the accessibility scan does not read.
  a11y: { exclude: ["[data-third-party]"] },

  // Optional. A check that the run can start, for example that the seed database is clean.
  // Return a message to stop the run before the first test. Call runPreflight(config) from the Playwright globalSetup file.
  preflight: async () => undefined,
});
