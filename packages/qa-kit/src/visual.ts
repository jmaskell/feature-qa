import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Browser } from "@playwright/test";
import { finding } from "./findings.ts";
import { readManifest } from "./manifest.ts";
import type { Finding } from "./types.ts";

export interface ImageDiff { sameSize: boolean; changed: number; total: number; ratio: number }
export interface VisualResult { stepId: string; status: "same" | "changed" | "new"; ratio: number }

/** The share of pixels that may change before a step counts as changed. */
export const VISUAL_TOLERANCE = 0.001;
// A pixel counts as changed when one colour channel moves by more than this. It ignores anti-alias noise.
const CHANNEL_TOLERANCE = 24;

export function defaultBaselineDir(root: string = process.cwd()): string {
  return join(root, "qa-baselines");
}

/** Compare two PNG images in a blank browser page with a canvas. No image library is needed. */
export async function compareImages(browser: Browser, a: Buffer, b: Buffer): Promise<ImageDiff> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ([a64, b64, tol]) => {
      const load = async (s: string) => { const img = new Image(); img.src = `data:image/png;base64,${s}`; await img.decode(); return img; };
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      const total = Math.max(ia.width * ia.height, ib.width * ib.height);
      if (ia.width !== ib.width || ia.height !== ib.height) return { sameSize: false, changed: total, total, ratio: 1 };
      const pixels = (img: HTMLImageElement) => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      let changed = 0;
      for (let i = 0; i < pa.length; i += 4) {
        if (Math.abs(pa[i]! - pb[i]!) > tol || Math.abs(pa[i + 1]! - pb[i + 1]!) > tol || Math.abs(pa[i + 2]! - pb[i + 2]!) > tol) changed++;
      }
      return { sameSize: true, changed, total, ratio: total === 0 ? 0 : changed / total };
    }, [a.toString("base64"), b.toString("base64"), CHANNEL_TOLERANCE] as const);
  } finally {
    await page.close();
  }
}

const exists = (p: string) => access(p).then(() => true, () => false);
const baselineOf = (baselineDir: string, stepId: string) => join(baselineDir, `${stepId}.png`);

/**
 * Compare each step screenshot of a run with its approved baseline.
 * The findings are warnings only: a visual change goes to a judge or to the owner. It never fails the run by itself.
 */
export async function diffRun(opts: { runDir: string; baselineDir: string; browser: Browser; tolerance?: number }): Promise<{ results: VisualResult[]; findings: Finding[] }> {
  const tolerance = opts.tolerance ?? VISUAL_TOLERANCE;
  const { steps } = await readManifest(opts.runDir);
  const results: VisualResult[] = [];
  const findings: Finding[] = [];
  for (const step of steps) {
    if (!step.screenshot) continue;
    const base = baselineOf(opts.baselineDir, step.id);
    const where = { route: step.route, viewport: step.viewport, ...(step.state === undefined ? {} : { state: step.state }) };
    if (!(await exists(base))) {
      results.push({ stepId: step.id, status: "new", ratio: 1 });
      findings.push(finding({ check: "visual", rule: "new-baseline", severity: "warn", message: `The step "${step.name.slice(0, 40)}" has no approved baseline.`, ...where }));
      continue;
    }
    const diff = await compareImages(opts.browser, await readFile(base), await readFile(join(opts.runDir, step.screenshot)));
    const status = diff.ratio > tolerance ? "changed" : "same";
    results.push({ stepId: step.id, status, ratio: diff.ratio });
    if (status === "changed") {
      findings.push(finding({ check: "visual", rule: "changed", severity: "warn", message: `${(diff.ratio * 100).toFixed(2)}% of the pixels changed.`, ...where }));
    }
  }
  await writeFile(join(opts.runDir, "visual.json"), JSON.stringify(results, null, 2));
  return { results, findings };
}

/** Copy the screenshots of a run to the baselines. With ids, copy only those steps. Return the ids copied. */
export async function approveBaselines(runDir: string, baselineDir: string, ids?: string[]): Promise<string[]> {
  const wanted = ids ? new Set(ids) : null;
  const done: string[] = [];
  for (const step of (await readManifest(runDir)).steps) {
    if (!step.screenshot || (wanted && !wanted.has(step.id))) continue;
    const target = baselineOf(baselineDir, step.id);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(runDir, step.screenshot), target);
    done.push(step.id);
  }
  return done;
}
