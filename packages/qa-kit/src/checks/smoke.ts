import type { Locator, Page } from "@playwright/test";
import { collectElements } from "../collect.ts";
import { finding } from "../findings.ts";
import type { Finding, QaConfig } from "../types.ts";
import { samePath } from "./access.ts";

export interface SmokeWatch {
  /** Waits until no CSP report has arrived for 100 ms (at most 1 s). */
  settle(): Promise<void>;
  /** Removes the listeners and returns the findings. Await settle() first, or late CSP reports are lost. */
  stop(): Finding[];
}

const ASSET_TYPES = new Set(["stylesheet", "script"]);
// A request that the browser or the page cancelled (navigation, abort) is not a failed asset.
const CANCELLED = /ERR_ABORTED|cancelled|NS_BINDING_ABORTED/i;

type CspSink = (directive: string, blocked: string, disposition: string) => void;
const lastCspAt = new WeakMap<Page, number>();
const cspSinks = new WeakMap<Page, Set<CspSink>>();

// Returns the path of a URL. Messages must not hold query strings or page text.
function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "(unknown)";
  }
}

// The binding and the init script cannot be removed from a page, so register them once.
async function ensureCspBinding(page: Page): Promise<Set<CspSink>> {
  const existing = cspSinks.get(page);
  if (existing) return existing;
  const sinks = new Set<CspSink>();
  cspSinks.set(page, sinks);
  await page.exposeBinding("__qaReportCsp", (_source, directive: string, blocked: string, disposition: string) => {
    lastCspAt.set(page, Date.now());
    for (const sink of sinks) sink(String(directive), String(blocked), String(disposition));
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const report = (window as unknown as { __qaReportCsp?: (d: string, b: string, p: string) => void }).__qaReportCsp;
      if (report) report(event.effectiveDirective, event.blockedURI, event.disposition);
    });
  });
  return sinks;
}

// Call before page.goto. Call it once for each page; a second call returns a new watch.
export async function watchSmoke(page: Page): Promise<SmokeWatch> {
  const found: Finding[] = [];
  const sinks = await ensureCspBinding(page);

  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() !== "error") return;
    found.push(finding({
      check: "smoke", rule: "console-error", severity: "fail",
      message: `The page wrote a console error (source: ${pathOf(msg.location().url)}).`,
    }));
  };
  const onPageError = () => {
    found.push(finding({
      check: "smoke", rule: "page-error", severity: "fail",
      message: "The page threw an uncaught error.",
    }));
  };
  const onResponse = (res: import("@playwright/test").Response) => {
    const type = res.request().resourceType();
    if (!ASSET_TYPES.has(type) || res.status() < 400) return;
    found.push(finding({
      check: "smoke", rule: "asset-failed", severity: "fail",
      message: `A ${type} answered ${res.status()}: ${pathOf(res.url())}.`,
    }));
  };
  const onRequestFailed = (req: import("@playwright/test").Request) => {
    const type = req.resourceType();
    if (!ASSET_TYPES.has(type) || CANCELLED.test(req.failure()?.errorText ?? "")) return;
    found.push(finding({
      check: "smoke", rule: "asset-failed", severity: "fail",
      message: `A ${type} request failed: ${pathOf(req.url())}.`,
    }));
  };
  const onCsp: CspSink = (directive, blocked, disposition) => {
    const target = /^https?:/.test(blocked) ? pathOf(blocked) : blocked.slice(0, 20);
    // A report-only policy blocks nothing, so its violation is a warning.
    const reportOnly = disposition === "report";
    found.push(finding({
      check: "smoke", rule: "csp-violation", severity: reportOnly ? "warn" : "fail",
      message: reportOnly
        ? `A report-only CSP reported a resource under the ${directive.slice(0, 40)} directive: ${target}.`
        : `The browser blocked a resource under the ${directive.slice(0, 40)} directive: ${target}.`,
    }));
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  sinks.add(onCsp);

  return {
    async settle() {
      const start = Date.now();
      while (Date.now() - start < 1000) {
        await new Promise((r) => setTimeout(r, 100));
        if (Date.now() - (lastCspAt.get(page) ?? 0) >= 100) return;
      }
    },
    stop() {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("response", onResponse);
      page.off("requestfailed", onRequestFailed);
      sinks.delete(onCsp);
      return found.slice();
    },
  };
}

async function snapshot(page: Page, locator: Locator): Promise<string> {
  try {
    const own = await locator.first().evaluate((el) => {
      const attrs = ["aria-expanded", "aria-pressed", "aria-checked", "aria-selected", "open", "hidden"]
        .map((a) => el.getAttribute(a));
      const input = el as HTMLInputElement;
      return [attrs, input.checked ?? null, input.value ?? null];
    });
    const doc = await page.evaluate(() => [
      document.body.innerText,
      document.querySelectorAll("[open]").length,
      document.querySelectorAll('[aria-expanded="true"]').length,
      document.querySelectorAll("dialog[open]").length,
    ]);
    const count = (await collectElements(page)).length;
    return JSON.stringify([page.url(), doc, count, own]);
  } catch {
    return "navigating"; // the page changed while we read it
  }
}

/** The time that a declared action has to take a click. */
export const ACTION_TIMEOUT_MS = 2000;

// Clicks the element, waits up to 2 s, and fails when the text, the URL and the element count stay the same.
// An element that cannot take a click in ACTION_TIMEOUT_MS (hidden, disabled or covered) gives a finding, not an error.
export async function checkAction(page: Page, locator: Locator, label: string): Promise<Finding[]> {
  const before = await snapshot(page, locator);
  try {
    await locator.click({ timeout: ACTION_TIMEOUT_MS });
  } catch {
    return [finding({
      check: "smoke", rule: "action-not-clickable", severity: "fail",
      message: `The action "${label.slice(0, 40)}" did not take a click in ${ACTION_TIMEOUT_MS / 1000} seconds. It is hidden, disabled or covered.`,
      route: pathOf(page.url()),
    })];
  }
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(100);
    if ((await snapshot(page, locator)) !== before) return [];
  }
  return [finding({
    check: "smoke", rule: "dead-action", severity: "fail",
    message: `The action "${label.slice(0, 40)}" changed nothing in 2 seconds.`,
    route: pathOf(page.url()),
  })];
}

/**
 * Rule unstyled: fails when the computed font-family of body is the browser default.
 * The default comes from a blank srcdoc iframe, so the check works in each browser
 * (WebKit gives "-webkit-standard", Chromium gives "Times New Roman") and a page that chooses a serif font passes.
 */
export async function checkStyled(page: Page): Promise<Finding[]> {
  const fonts = await page.evaluate(async () => {
    const body = getComputedStyle(document.body).fontFamily;
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
    const loaded = new Promise<void>((resolve) => { frame.addEventListener("load", () => resolve(), { once: true }); });
    frame.srcdoc = "<!doctype html><title>x</title><body></body>";
    document.documentElement.appendChild(frame);
    try {
      await Promise.race([loaded, new Promise((r) => setTimeout(r, 2000))]);
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      return { body, blank: doc && doc.body && win ? win.getComputedStyle(doc.body).fontFamily : null };
    } finally {
      frame.remove();
    }
  });
  if (fonts.blank === null || fonts.body !== fonts.blank) return [];
  return [finding({
    check: "smoke", rule: "unstyled", severity: "fail",
    message: "The page text uses the browser default font, so the stylesheet may be missing.",
    route: pathOf(page.url()),
  })];
}

/**
 * Click each declared action for the current route and role, in order, and expect the page to change.
 * Run it after the page checks: an action changes the page.
 */
export async function checkDeclaredActions(page: Page, config: QaConfig, role?: string): Promise<Finding[]> {
  const path = pathOf(page.url());
  if (path === "(unknown)") return [];
  const out: Finding[] = [];
  for (const action of config.actions ?? []) {
    if (!samePath(action.route, path)) continue;
    if (action.role !== undefined && action.role !== role) continue;
    const locator = page.locator(action.selector);
    if ((await locator.count()) === 0) {
      out.push(finding({
        check: "smoke", rule: "action-missing", severity: "fail", route: path,
        message: `The declared action "${action.label.slice(0, 40)}" is not on the page.`,
      }));
      continue;
    }
    out.push(...(await checkAction(page, locator.first(), action.label)));
  }
  return out;
}
