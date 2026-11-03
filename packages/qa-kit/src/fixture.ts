import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { watchLeaks } from "./checks/leaks.ts";
import { checkDeclaredActions, watchSmoke } from "./checks/smoke.ts";
import { collectElements, collectText } from "./collect.ts";
import { dedupe } from "./findings.ts";
import { loadPlaywright } from "./playwright.ts";
import { settleLayout } from "./checks/a11y.ts";
import type { QaSnapshot } from "./profiles.ts";
import { filterIgnored, PAGE_CHECKS, runPageChecks } from "./run-checks.ts";
import { appendStep, hasQaRunId, nextSeq, runDir, type StepRecord } from "./manifest.ts";
import { timed, type Timings } from "./timing.ts";
import type { CheckId, Finding, QaConfig } from "./types.ts";

export interface StepOptions {
  state?: string;
  /** The path to the mock region (PNG or HTML), relative to the project root. */
  mock?: string;
  criteria?: string[];
  checks?: CheckId[];
  fullPage?: boolean;
  /** Click the declared actions for this role after the page checks. Use "anonymous" for a signed-out visitor. */
  actionsAs?: string;
}

export interface Qa {
  step(name: string, opts?: StepOptions): Promise<StepRecord>;
}

export interface QaTestOptions {
  /** Return the server log text. The leak check scans it. Not set by default. */
  serverLog?: () => Promise<string>;
}

let warnedRunId = false;

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "x";
}

function sha256(...parts: Array<string | Buffer>): string {
  const hash = createHash("sha256");
  for (const p of parts) hash.update(p);
  return hash.digest("hex");
}

/** Fail the test once for each "fail" finding. The test goes on, so one run shows every problem. */
function reportFailures(findings: Finding[], prefix = ""): void {
  const { expect } = loadPlaywright();
  for (const f of findings) {
    if (f.severity === "fail") expect.soft(false, `${prefix}${f.check}/${f.rule}: ${f.message}`).toBe(true);
  }
}

// A snapshot runs the checks that only read the page. Focus and hover are the same as in its journey profile.
const SNAPSHOT_CHECKS = new Set<CheckId>(["smoke", "layout", "copy", "conformance", "a11y"]);

function teardownError(error: unknown): Finding {
  const name = error instanceof Error ? error.name : "Error";
  return { check: "smoke", rule: "teardown-error", severity: "fail", message: `The after-test scan stopped with ${name}.` };
}

/**
 * Make a Playwright `test` with a `qa` fixture.
 * Around each test the fixture runs the smoke and leak watchers. Their findings go into
 * a final step record named "after-test".
 */
export function createQaTest(config: QaConfig, options: QaTestOptions = {}) {
  const base = loadPlaywright().test;
  return base.extend<{ qa: Qa; qaTextScale: number; qaSnapshots: { profiles: QaSnapshot[] } }>({
    qaTextScale: [1, { option: true }],
    // Set by qaProjects({ profilesAs: "snapshots" }). Each qa.step also takes each of these profiles as a snapshot.
    // An object, not an array: Playwright reads an array option as a [value, options] pair.
    qaSnapshots: [{ profiles: [] }, { option: true }],
    qa: async ({ page, qaTextScale, qaSnapshots }, use, testInfo) => {
      if (qaTextScale !== 1) {
        // Text zoom: a larger root font size. It applies before the page scripts run and again when the document is ready.
        await page.addInitScript((scale) => {
          const apply = () => { if (document.documentElement) document.documentElement.style.fontSize = `${scale * 100}%`; };
          apply();
          document.addEventListener("DOMContentLoaded", apply);
        }, qaTextScale);
      }
      if (!hasQaRunId() && !warnedRunId) {
        warnedRunId = true;
        console.warn("qa: QA_RUN_ID is not set, so this worker uses its own run directory. Call ensureQaRunId() at the top of playwright.config.ts.");
      }
      const dir = runDir();
      const project = testInfo.project.name;
      const specFile = relative(testInfo.project.testDir, testInfo.file).replace(/\.[^./\\]+$/, "");
      const testSlugOf = (p: string) => [slug(p), slug(specFile), slug(testInfo.titlePath.slice(1).join(" "))].join("/");
      const testSlug = testSlugOf(project);
      const size = () => page.viewportSize();
      const viewportOf = () => {
        const s = size();
        return s ? `${s.width}x${s.height}` : "unknown";
      };
      let counter = 0;

      // The after-test record keeps the time of the watchers: their set-up here, and the scan at the end.
      const afterTimings: Timings = {};
      const smoke = await timed(afterTimings, "after-test.watch", () => watchSmoke(page));
      const leaks = await timed(afterTimings, "after-test.watch", () => watchLeaks(page, {
        values: config.scenarios.flatMap((s) => s.knownValues),
        ownOrigins: config.ownOrigins ?? [new URL(config.baseURL).origin],
        serverLog: options.serverLog,
      }));

      // Capture first. The checks hover, focus, press keys and resize, so they change the page.
      const capture = async (stepProject: string, n: number, name: string, opts: StepOptions, timings: Timings) => {
        const viewport = viewportOf();
        const route = new URL(page.url()).pathname;
        const id = `${testSlugOf(stepProject)}/${String(n).padStart(2, "0")}-${slug(name)}/${viewport}`;
        const screenshot = join("screenshots", `${id}.png`);
        await timed(timings, "fonts", () => page.evaluate(() => document.fonts.ready.then(() => undefined)));
        await mkdir(dirname(join(dir, screenshot)), { recursive: true });
        const bytes = await timed(timings, "screenshot", () => page.screenshot({ path: join(dir, screenshot), fullPage: opts.fullPage ?? false, animations: "disabled" }));
        // One collection serves the text capture and every page check.
        const elements = await timed(timings, "collect", () => collectElements(page));
        const { text, names, title } = await timed(timings, "text", () => collectText(page, elements));
        const aria = await timed(timings, "aria", () => page.locator("body").ariaSnapshot());
        return { id, viewport, route, screenshot, bytes, elements, text, names, title, aria };
      };

      const finish = async (stepProject: string, c: Awaited<ReturnType<typeof capture>>, name: string, opts: StepOptions, found: Finding[], timings: Timings, prefix = "") => {
        const { id, viewport, route, screenshot, text, names, title, aria } = c;
        const findings = dedupe(found.map((f) => ({ ...f, route, viewport, ...(opts.state === undefined ? {} : { state: opts.state }) })));
        const record: StepRecord = {
          id, name, route, viewport, project: stepProject, screenshot, text, names, title, aria, findings,
          ...(opts.state === undefined ? {} : { state: opts.state }),
          ...(opts.mock === undefined ? {} : { mock: opts.mock }),
          ...(opts.criteria === undefined ? {} : { criteria: opts.criteria }),
          hash: sha256(c.bytes, JSON.stringify({ text, names, title })),
          seq: nextSeq(),
          timings,
        };
        await appendStep(dir, record);
        reportFailures(findings, prefix);
        return record;
      };

      // Set the snapshot profile, take the step with the checks that only read the page, and put the page back.
      const snapshot = async (snap: QaSnapshot, n: number, name: string, opts: StepOptions) => {
        const timings: Timings = {};
        const original = page.viewportSize();
        const fontSize = await page.evaluate(() => document.documentElement.style.fontSize);
        const media = testInfo.project.use as { colorScheme?: "light" | "dark" | "no-preference"; reducedMotion?: "reduce" | "no-preference" };
        try {
          await timed(timings, "apply", async () => {
            await page.setViewportSize(snap.viewport);
            if (snap.colorScheme || snap.reducedMotion) {
              await page.emulateMedia({ ...(snap.colorScheme ? { colorScheme: snap.colorScheme } : {}), ...(snap.reducedMotion ? { reducedMotion: snap.reducedMotion } : {}) });
            }
            if (snap.textScale) await page.evaluate((scale) => { document.documentElement.style.fontSize = `${scale * 100}%`; }, snap.textScale);
            await settleLayout(page);
          });
          const c = await capture(snap.project, n, name, opts, timings);
          const checks = (opts.checks ?? PAGE_CHECKS).filter((id) => SNAPSHOT_CHECKS.has(id));
          // The reflow rule resizes to 320 px wide, so its result depends on the text scale only.
          const found = await timed(timings, "checks", () => runPageChecks(page, config, checks, {
            textScale: snap.textScale ?? qaTextScale, timings, elements: c.elements, reflow: snap.textScale !== undefined && snap.textScale !== qaTextScale,
          }));
          await finish(snap.project, c, name, opts, found, timings, `[${snap.project}] `);
        } finally {
          if (original) await page.setViewportSize(original);
          if (snap.colorScheme || snap.reducedMotion) {
            await page.emulateMedia({ colorScheme: media.colorScheme ?? "light", reducedMotion: media.reducedMotion ?? "no-preference" });
          }
          if (snap.textScale) await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, fontSize);
          await settleLayout(page);
        }
      };

      const qa: Qa = {
        async step(name, opts = {}) {
          counter += 1;
          const n = counter;
          const timings: Timings = {};
          const c = await capture(project, n, name, opts, timings);
          leaks.addTitle(c.title);
          // The snapshots come before the checks, so they show the state as the test left it.
          for (const snap of qaSnapshots.profiles) await timed(timings, "snapshots", () => snapshot(snap, n, name, opts));

          let found = await timed(timings, "checks", () => runPageChecks(page, config, opts.checks, { textScale: qaTextScale, timings, elements: c.elements }));
          if (opts.actionsAs !== undefined) {
            const acted = await timed(timings, "actions", () => checkDeclaredActions(page, config, opts.actionsAs));
            found = [...found, ...(await filterIgnored(page, acted, config.ignore))];
          }
          return finish(project, c, name, opts, found, timings);
        },
      };

      await use(qa);

      let findings: Finding[] = [];
      try {
        await timed(afterTimings, "after-test.settle", () => smoke.settle());
        findings.push(...smoke.stop());
      } catch (error) {
        findings.push(teardownError(error));
      }
      try {
        findings.push(...(await timed(afterTimings, "after-test.leaks", () => leaks.stop())));
      } catch (error) {
        findings.push(teardownError(error));
      } finally {
        findings = dedupe(await timed(afterTimings, "after-test.ignore", () => filterIgnored(page, findings, config.ignore)));
        await appendStep(dir, {
          id: `${testSlug}/after-test/${viewportOf()}`,
          name: "after-test",
          route: page.url() === "about:blank" ? "" : new URL(page.url()).pathname,
          viewport: viewportOf(),
          project,
          screenshot: "",
          text: [], names: [], title: "", aria: "",
          findings,
          hash: sha256(JSON.stringify(findings)),
          seq: nextSeq(),
          timings: afterTimings,
        });
        reportFailures(findings);
      }
    },
  });
}
