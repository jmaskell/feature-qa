import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { appendStep, type StepRecord } from "../../src/manifest.ts";
import { approveBaselines, compareImages, diffRun } from "../../src/visual.ts";

async function shot(page: import("@playwright/test").Page, defect = "none"): Promise<Buffer> {
  await page.context().addCookies([{ name: "qa_defect", value: defect, url: "http://localhost:4400" }]);
  await page.goto("/");
  return page.screenshot({ animations: "disabled" });
}

test("compareImages finds no change in the same page and a change in a defect", async ({ page, browser }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const a = await shot(page);
  const b = await shot(page);
  const c = await shot(page, "layout-type");
  expect((await compareImages(browser, a, b)).changed).toBe(0);
  const diff = await compareImages(browser, a, c);
  expect(diff.sameSize).toBe(true);
  expect(diff.changed).toBeGreaterThan(0);
});

test("compareImages gives ratio 1 for images of different sizes", async ({ page, browser }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const a = await shot(page);
  await page.setViewportSize({ width: 400, height: 600 });
  const b = await shot(page);
  expect(await compareImages(browser, a, b)).toMatchObject({ sameSize: false, ratio: 1 });
});

test("diffRun marks new steps, approve stores them, and the next run is the same", async ({ page, browser }) => {
  const runDir = await mkdtemp(join(tmpdir(), "qa-run-"));
  const baselineDir = await mkdtemp(join(tmpdir(), "qa-base-"));
  await page.setViewportSize({ width: 800, height: 600 });
  const step: StepRecord = {
    id: "chromium/visual/home/01-home/800x600", name: "home", route: "/", viewport: "800x600", project: "chromium",
    screenshot: "screenshots/chromium/visual/home/01-home/800x600.png", text: [], names: [], title: "", aria: "", findings: [], hash: "h",
  };
  await appendStep(runDir, step);
  await mkdir(join(runDir, "screenshots/chromium/visual/home/01-home"), { recursive: true });
  await writeFile(join(runDir, step.screenshot), await shot(page));

  const first = await diffRun({ runDir, baselineDir, browser });
  expect(first.results.map((r) => r.status)).toEqual(["new"]);
  expect(first.findings.map((f) => [f.check, f.rule, f.severity])).toEqual([["visual", "new-baseline", "warn"]]);
  expect(await approveBaselines(runDir, baselineDir)).toEqual([step.id]);
  const second = await diffRun({ runDir, baselineDir, browser });
  expect(second.results.map((r) => r.status)).toEqual(["same"]);
  expect(second.findings).toEqual([]);
  expect(JSON.parse(await readFile(join(runDir, "visual.json"), "utf8"))).toEqual(second.results);
});
