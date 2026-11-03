import type { Page } from "@playwright/test";
import { defineQaConfig } from "@jmaskell/feature-qa-kit";
// @ts-expect-error The fixture app is plain JavaScript and has no types.
import { KNOWN_VALUES } from "./app/seed.mjs";

export default defineQaConfig({
  baseURL: "http://localhost:4400",
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
  copy: {
    bannedTerms: ["seamless"],
    maxButtonWords: 4,
    emptyValueWord: "None",
    caseRule: "sentence",
    properNouns: ["Harbour Lettings"],
    rulesFile: "copy-rules.md",
  },
});
