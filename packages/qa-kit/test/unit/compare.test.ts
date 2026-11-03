import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { compareRuns } from "../../src/compare.ts";
import { appendStep, type StepRecord } from "../../src/manifest.ts";
import type { Finding } from "../../src/types.ts";

const step = (id: string, findings: Finding[]): StepRecord => ({
  id, name: "s", route: "/", viewport: "375x812", project: id.split("/")[0]!, screenshot: "", text: [], names: [], title: "", aria: "", findings, hash: "h",
});
const f = (rule: string, selector?: string, extra: Partial<Finding> = {}): Finding => ({ check: "layout", rule, severity: "fail", message: "m", ...(selector ? { selector } : {}), ...extra });

describe("compareRuns", () => {
  it("is the same when the findings match, whatever the message", () => {
    const a = [step("chromium-phone/s/t/01-a/375x812", [f("overlap", "#x")])];
    const b = [step("chromium-phone/s/t/01-a/375x812", [{ ...f("overlap", "#x"), message: "other words" }])];
    expect(compareRuns(a, b)).toMatchObject({ same: true, added: [], removed: [], changed: [], findings: { a: 1, b: 1 } });
  });

  it("names an added, a removed and a changed finding", () => {
    const a = [step("chromium-phone/s/t/01-a/375x812", [f("overlap", "#x"), f("clipped-text", "#y", { count: 2 })])];
    const b = [step("chromium-phone/s/t/01-a/375x812", [f("overlap", "#z"), f("clipped-text", "#y", { count: 3 })])];
    const r = compareRuns(a, b);
    expect(r.same).toBe(false);
    expect(r.added).toEqual([{ key: "chromium-phone › s/t › 01-a › layout/overlap › #z › fail", count: 1 }]);
    expect(r.removed).toEqual([{ key: "chromium-phone › s/t › 01-a › layout/overlap › #x › fail", count: 1 }]);
    expect(r.changed).toEqual([{ key: "chromium-phone › s/t › 01-a › layout/clipped-text › #y › fail", a: 2, b: 3 }]);
  });

  it("keys by profile and severity", () => {
    const a = [step("chromium-phone/s/t/01-a/375x812", [f("overlap", "#x")])];
    const b = [step("chromium-laptop/s/t/01-a/1280x800", [f("overlap", "#x", { severity: "warn" })])];
    const r = compareRuns(a, b);
    expect(r.added).toHaveLength(1);
    expect(r.removed).toHaveLength(1);
    expect(r.stepsOnlyInA).toEqual(["chromium-phone › s/t › 01-a"]);
    expect(r.stepsOnlyInB).toEqual(["chromium-laptop › s/t › 01-a"]);
  });

  it("names a step that only one run has, even with no findings", () => {
    const a = [step("chromium-phone/s/t/01-a/375x812", []), step("chromium-phone/s/t/02-b/375x812", [])];
    const b = [step("chromium-phone/s/t/01-a/375x812", [])];
    expect(compareRuns(a, b)).toMatchObject({ same: false, stepsOnlyInA: ["chromium-phone › s/t › 02-b"], stepsOnlyInB: [] });
  });
});

describe("qa compare", () => {
  const CLI = resolve(import.meta.dirname, "../../src/cli.ts");
  const exec = promisify(execFile);
  const run = async (...args: string[]) => {
    try {
      return { code: 0, out: (await exec("node", [CLI, "compare", ...args])).stdout };
    } catch (e) {
      const err = e as { code: number; stdout: string };
      return { code: err.code, out: err.stdout };
    }
  };

  it("exits 0 for the same findings, 1 for a difference and 2 for a bad call", async () => {
    const root = await mkdtemp(join(tmpdir(), "qa-compare-"));
    const [a, b, c] = ["a", "b", "c"].map((n) => join(root, n));
    await appendStep(a!, step("chromium-phone/s/t/01-a/375x812", [f("overlap", "#x")]));
    await appendStep(b!, step("chromium-phone/s/t/01-a/375x812", [f("overlap", "#x")]));
    await appendStep(c!, step("chromium-phone/s/t/01-a/375x812", []));
    expect((await run(a!, b!)).code).toBe(0);
    const diff = await run(a!, c!);
    expect(diff.code).toBe(1);
    expect(JSON.parse(diff.out).removed).toHaveLength(1);
    expect((await run(a!)).code).toBe(2);
    expect((await run(a!, join(root, "none"))).code).toBe(2);
  });
});
