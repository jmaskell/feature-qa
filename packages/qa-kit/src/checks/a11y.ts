import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { collectElements, type ElementInfo } from "../collect.ts";
import { finding } from "../findings.ts";
import type { Finding } from "../types.ts";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// The origin of a frame URL. A frame with no URL of its own (about:blank, about:srcdoc) has the origin of its parent.
function frameOrigin(url: string): string | null {
  if (url === "" || url.startsWith("about:")) return null;
  try {
    return new URL(url).origin;
  } catch {
    return "opaque";
  }
}

// One finding for each violation node. The message is the generic rule text.
// The check does not keep the node HTML, because it can hold personal data.
// When every frame has the origin of the page, axe-core runs once in the page (the AxeBuilder legacy mode).
// The default mode also reads cross-origin frames, but it opens a blank page for each scan, which takes about twice as long.
export async function checkA11y(page: Page, opts: { exclude?: string[] } = {}): Promise<Finding[]> {
  const origin = frameOrigin(page.url());
  const sameOrigin = page.frames().every((f) => { const o = frameOrigin(f.url()); return o === null || o === origin; });
  let builder = new AxeBuilder({ page }).withTags(TAGS).setLegacyMode(sameOrigin);
  for (const selector of opts.exclude ?? []) builder = builder.exclude(selector);
  const results = await builder.analyze();
  const out: Finding[] = [];
  for (const violation of results.violations) {
    const severity = violation.impact === "serious" || violation.impact === "critical" ? "fail" : "warn";
    for (const node of violation.nodes) {
      out.push(finding({
        check: "a11y",
        rule: `axe-${violation.id}`,
        severity,
        message: violation.help,
        selector: String(node.target[0] ?? ""),
      }));
    }
  }
  return out;
}

const REFLOW_WIDTH = 320;
// One pixel of tolerance for sub-pixel rounding in scrollWidth.
const TOLERANCE_PX = 1;

// Wait until the document scroll width is the same in two frames in a row, for at most 10 frames.
// A script that reacts to the resize can change the layout one frame late, so one frame is not enough.
export async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    let last = -1;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const width = document.documentElement.scrollWidth;
      if (width === last) return;
      last = width;
    }
  });
}

/**
 * Reflow: content must fit in 320 CSS px wide without a horizontal scroll bar.
 * The check resizes the viewport and restores it after. It does not reload the page,
 * so the page state (open dialog, form input) stays as the caller left it.
 */
export async function checkReflow(page: Page): Promise<Finding[]> {
  const original = page.viewportSize();
  // With no fixed viewport the window size belongs to the caller. The check cannot restore it, so it does not run.
  if (original === null) {
    return [finding({ check: "a11y", rule: "reflow-skipped", severity: "warn", message: "The viewport has no fixed size, so the reflow rule did not run." })];
  }
  await page.setViewportSize({ width: REFLOW_WIDTH, height: 256 });
  try {
    await settleLayout(page);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth <= REFLOW_WIDTH + TOLERANCE_PX) return [];
    return [finding({
      check: "a11y",
      rule: "reflow",
      severity: "fail",
      message: "The page scrolls sideways at 320 CSS px wide.",
      selector: "html",
    })];
  } finally {
    await page.setViewportSize(original);
    await settleLayout(page);
  }
}

/**
 * Forced colours: each enabled control must keep a text, an icon or a border.
 * The browser removes background colours in forced-colours mode, so a control that shows only a background disappears.
 * Form fields are drawn by the browser, so they always pass. forced-color-adjust: none means the author handles the mode.
 * Pass `given` to use elements that the caller collected.
 */
export async function checkForcedColors(page: Page, given?: ElementInfo[]): Promise<Finding[]> {
  const controls = (given ?? (await collectElements(page))).filter((e) => e.interactive && !e.disabled);
  const lost = await page.evaluate((selectors) => selectors.filter((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const s = getComputedStyle(el);
    if ((s.getPropertyValue("forced-color-adjust") || "auto") === "none") return false;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return false;
    if ((el.textContent ?? "").trim() !== "") return false;
    if (el.querySelector("img, svg, picture, video, canvas")) return false;
    if (s.backgroundImage.includes("url(")) return false;
    const sides = ["top", "right", "bottom", "left"];
    return !sides.some((side) => parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0
      && !["none", "hidden"].includes(s.getPropertyValue(`border-${side}-style`)));
  }), controls.map((e) => e.selector));
  return lost.map((selector) => finding({
    check: "a11y", rule: "forced-colors", severity: "fail", selector,
    message: "In forced-colours mode this control shows no text, icon or border, so it disappears.",
  }));
}
