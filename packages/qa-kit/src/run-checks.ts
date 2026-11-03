import type { Page } from "@playwright/test";
import { checkA11y, checkForcedColors, checkReflow } from "./checks/a11y.ts";
import { checkConformance } from "./checks/conformance.ts";
import { checkCopy } from "./checks/copy.ts";
import { checkInteraction } from "./checks/interaction.ts";
import { checkLayout, type LayoutOptions } from "./checks/layout.ts";
import { checkStyled } from "./checks/smoke.ts";
import { collectElements, type ElementInfo } from "./collect.ts";
import { applyIgnore } from "./findings.ts";
import { timed, type Timings } from "./timing.ts";
import type { CheckId, Finding, IgnoreEntry, QaConfig } from "./types.ts";

export interface PageCheckOptions extends LayoutOptions {
  /** When set, each check adds its time in milliseconds under "checks.<name>". */
  timings?: Timings;
  /** The visible elements of the page, as the caller collected them. Default: the checks collect them once. */
  elements?: ElementInfo[];
  /** With "a11y": run the reflow rule. Default true. */
  reflow?: boolean;
}

export const PAGE_CHECKS: CheckId[] = ["smoke", "layout", "interaction", "copy", "conformance", "a11y"];

function pathOf(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

/**
 * Drop the findings that match an entry of `ignore`. An entry selector matches when the finding element
 * matches it or sits inside a match on the current page. When the page cannot answer, the selectors are compared as text.
 */
export async function filterIgnored(page: Page, findings: Finding[], ignore: readonly IgnoreEntry[] = []): Promise<Finding[]> {
  if (ignore.length === 0 || findings.length === 0) return findings;
  const pairs = findings.flatMap((f) => ignore.filter((e) => e.selector && f.selector).map((e) => [f.selector!, e.selector!] as [string, string]));
  let inside: Set<string> | null = null;
  try {
    const hits = await page.evaluate((list) => list.filter(([el, sel]) => {
      try {
        return document.querySelector(el)?.closest(sel) != null;
      } catch {
        return false; // not a valid selector
      }
    }), pairs);
    inside = new Set(hits.map(([a, b]) => `${a}\u0000${b}`));
  } catch {
    // The page is closed or busy. Use the text comparison.
  }
  return inside === null ? applyIgnore(findings, ignore) : applyIgnore(findings, ignore, (a, b) => inside!.has(`${a}\u0000${b}`));
}

/**
 * Run the page checks on the current page. The default is every page check.
 * "smoke" here is the page part of smoke (the unstyled rule). The smoke watchers, leaks and access need
 * set-up around navigation, so the caller runs them.
 * "a11y" runs axe-core (with config.a11y.exclude), the forced-colours rule and the reflow rule. Reflow resizes the viewport and restores it,
 * and does not reload, so the page state stays.
 * The page is collected once, and every check reads that one collection. The checks that only read the page run first.
 * The checks that change the page (focus, hover and the reflow resize) run last.
 * `opts.textScale` is the text scale of the page. The layout type-scale rule accepts the font size or the font size divided by it.
 * Findings that match config.ignore are dropped.
 */
export async function runPageChecks(page: Page, config: QaConfig, checks: CheckId[] = PAGE_CHECKS, opts: PageCheckOptions = {}): Promise<Finding[]> {
  const wanted = new Set(checks);
  const t = opts.timings;
  const found: Finding[] = [];
  const run = async (key: string, fn: () => Promise<Finding[]>) => { found.push(...(await timed(t, `checks.${key}`, fn))); };
  const usesElements = ["layout", "interaction", "copy", "conformance", "a11y"].some((c) => wanted.has(c as CheckId));
  const els = opts.elements ?? (usesElements ? await timed(t, "checks.collect", () => collectElements(page)) : []);
  // Read only.
  if (wanted.has("smoke")) await run("smoke", () => checkStyled(page));
  if (wanted.has("layout")) await run("layout", () => checkLayout(page, config.designSystem, { textScale: opts.textScale }, els));
  if (wanted.has("copy")) await run("copy", () => checkCopy(page, config.copy, els));
  if (wanted.has("conformance") && config.designSystem) await run("conformance", () => checkConformance(page, config.designSystem!, els));
  if (wanted.has("a11y")) {
    await run("axe", () => checkA11y(page, config.a11y));
    await run("forced-colors", () => checkForcedColors(page, els));
  }
  // These change the page: focus, pointer, scroll and viewport.
  if (wanted.has("interaction")) await run("interaction", () => checkInteraction(page, { maxElements: 20, timings: t, elements: els }));
  if (wanted.has("a11y") && opts.reflow !== false) await run("reflow", () => checkReflow(page));
  const route = pathOf(page.url());
  const withRoute = found.map((f) => (f.route !== undefined || route === undefined ? f : { ...f, route }));
  return timed(t, "checks.ignore", () => filterIgnored(page, withRoute, config.ignore));
}
