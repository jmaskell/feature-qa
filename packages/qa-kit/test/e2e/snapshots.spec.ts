import { expect } from "@playwright/test";
import { createQaTest } from "../../src/fixture.ts";
import { defineQaConfig } from "../../src/config.ts";
import { readManifest, runDir } from "../../src/manifest.ts";
import { QA_VIEWPORTS, type QaSnapshot } from "../../src/profiles.ts";

const config = defineQaConfig({ baseURL: "http://localhost:4400", routes: ["/"], roles: [], scenarios: [], accessMatrix: {} });
const test = createQaTest(config);

const SNAPSHOTS: QaSnapshot[] = [
  { project: "x-tablet", viewport: { ...QA_VIEWPORTS.tablet } },
  { project: "x-phone-dark", viewport: { ...QA_VIEWPORTS.phone }, colorScheme: "dark" },
  { project: "x-phone-text-200", viewport: { ...QA_VIEWPORTS.phone }, textScale: 2 },
];

// The page writes its width, its colour scheme and its root font size as text, so each record shows what its snapshot set.
const PAGE = `<style>button{cursor:pointer} button:focus-visible{outline:2px solid blue} .wide{width:10px}
  @media (min-width:700px) and (max-width:800px){.wide{width:2000px}}</style>
  <p id="state"></p><button>Go</button><div class="wide">x</div>
  <script>const show = () => { document.getElementById("state").textContent =
    innerWidth + " " + (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") + " " + getComputedStyle(document.documentElement).fontSize; };
    show(); addEventListener("resize", show); matchMedia("(prefers-color-scheme: dark)").addEventListener("change", show);
    new MutationObserver(show).observe(document.documentElement, { attributes: true });</script>`;

test.describe("snapshot profiles", () => {
  test.use({ viewport: { ...QA_VIEWPORTS.phone }, qaSnapshots: { profiles: SNAPSHOTS } });

  test("each qa.step writes one record for each snapshot, and puts the page back", async ({ page, qa }, testInfo) => {
    await page.setContent(PAGE.replace("@media (min-width:700px) and (max-width:800px)", "@media (min-width:9999px)"));
    const rec = await qa.step("state", { checks: ["layout"] });
    expect(rec.project).toBe(testInfo.project.name);
    const steps = (await readManifest(runDir())).steps.filter((s) => s.id.includes("each-qa-step-writes-one-record") && s.name === "state");
    const text = (project: string) => steps.find((s) => s.project === project)?.text.join(" ");
    expect(text("x-tablet")).toContain("768 light 16px");
    expect(text("x-phone-dark")).toContain("375 dark 16px");
    expect(text("x-phone-text-200")).toContain("375 light 32px");
    expect(steps.find((s) => s.project === "x-tablet")?.id).toMatch(/^x-tablet\/snapshots-spec\/.+\/01-state\/768x1024$/);
    // The page is back as the test left it.
    await expect(page.locator("#state")).toHaveText("375 light 16px");
    expect(page.viewportSize()).toEqual(QA_VIEWPORTS.phone);
  });

  test.describe("a defect that only a snapshot shows", () => {
    test.fail();
    test("fails the journey test", async ({ page, qa }) => {
      await page.setContent(PAGE);
      const rec = await qa.step("state", { checks: ["layout"] });
      expect(rec.findings).toEqual([]); // the phone itself is clean
    });
  });
});
