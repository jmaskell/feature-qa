import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReportData } from "../../src/report.ts";
import { describe, expect, it } from "vitest";
import { putVerdict } from "../../src/cache.ts";
import { appendStep, type StepRecord } from "../../src/manifest.ts";
import { isBlocked, loadReportData, ownerList, renderReport, reportStatus, writeReport } from "../../src/report.ts";

const base: StepRecord = { id: "chromium/s/t/01-home/375x812", name: "Home <b>", route: "/", viewport: "375x812", project: "chromium",
  screenshot: "screenshots/chromium/s/t/01-home/375x812.png", text: ['<script>alert("x")</script>'], names: [], title: "", aria: "", findings: [], hash: "h" };

async function fixture(step: StepRecord = base) {
  const runDir = await mkdtemp(join(tmpdir(), "qa-rep-"));
  const cacheDir = await mkdtemp(join(tmpdir(), "qa-cache-"));
  await appendStep(runDir, step);
  return { runDir, cacheDir };
}

describe("report", () => {
  it("escapes page text and names, and links the screenshot by a relative path", async () => {
    const { runDir, cacheDir } = await fixture();
    const html = renderReport(await loadReportData(runDir, cacheDir), runDir);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Home &lt;b&gt;");
    expect(html).toContain('src="screenshots/chromium/s/t/01-home/375x812.png"');
  });

  it("puts only cannot-judge, taste and visual items on the owner list", async () => {
    const { runDir, cacheDir } = await fixture();
    const index = [
      { judge: "copy", key: "a".repeat(64), stepIds: [base.id], input: "x", cached: true },
      { judge: "hierarchy", key: "b".repeat(64), stepIds: [base.id], input: "y", cached: true },
      { judge: "hierarchy", key: "c".repeat(64), stepIds: [base.id], input: "z", cached: false },
    ];
    await writeFile(join(runDir, "judge-index.json"), JSON.stringify(index));
    await putVerdict(cacheDir, "a".repeat(64), { judge: "copy", judgeVersion: "1", verdict: "pass", reason: "Fine.", taste: ["Warmer tone"] });
    await putVerdict(cacheDir, "b".repeat(64), { judge: "hierarchy", judgeVersion: "1", verdict: "cannot-judge", reason: "No mock." });
    await writeFile(join(runDir, "visual.json"), JSON.stringify([{ stepId: base.id, status: "changed", ratio: 0.2 }]));
    const data = await loadReportData(runDir, cacheDir);
    expect(ownerList(data).map((i) => i.kind).sort()).toEqual(["cannot-judge", "taste", "visual"]);
    expect(data.pending).toBe(1);
    expect(isBlocked(data)).toBe(false);
  });

  it("is blocked by a fail finding or a fail verdict, and writes report.html", async () => {
    const failing = { ...base, findings: [{ check: "copy" as const, rule: "doubled-punctuation", severity: "fail" as const, message: "Text has doubled punctuation." }] };
    const { runDir, cacheDir } = await fixture(failing);
    const result = await writeReport(runDir, cacheDir);
    expect(result.blocked).toBe(true);
    expect(await readFile(result.path, "utf8")).toContain("doubled-punctuation");
  });

  async function withVerdicts(list: Array<{ judge: string; key: string; verdict: "pass" | "fail" | "cannot-judge"; stored?: boolean }>, step: StepRecord = base) {
    const { runDir, cacheDir } = await fixture(step);
    const index = list.map((v) => ({ judge: v.judge, key: v.key, stepIds: [step.id], input: "x", cached: v.stored !== false }));
    await writeFile(join(runDir, "judge-index.json"), JSON.stringify(index));
    for (const v of list) {
      if (v.stored === false) continue;
      await putVerdict(cacheDir, v.key, { judge: v.judge, judgeVersion: "1", verdict: v.verdict, reason: `${v.judge} said ${v.verdict}.` });
    }
    return { runDir, cacheDir, data: await loadReportData(runDir, cacheDir) };
  }

  it("is blocked by a fail verdict from a step judge and from a feature judge", async () => {
    const step = await withVerdicts([{ judge: "copy", key: "a".repeat(64), verdict: "fail" }]);
    expect(isBlocked(step.data)).toBe(true);
    const feature = await withVerdicts([{ judge: "coherence", key: "b".repeat(64), verdict: "fail" }]);
    expect(feature.data.featureVerdicts).toHaveLength(1);
    expect(isBlocked(feature.data)).toBe(true);
  });

  it("puts hierarchy, first-use and coherence fails on the owner list, and not copy fails", async () => {
    const { data } = await withVerdicts([
      { judge: "copy", key: "a".repeat(64), verdict: "fail" },
      { judge: "hierarchy", key: "b".repeat(64), verdict: "fail" },
      { judge: "first-use", key: "c".repeat(64), verdict: "fail" },
      { judge: "coherence", key: "d".repeat(64), verdict: "pass" },
    ]);
    const owner = ownerList(data);
    expect(owner.filter((i) => i.kind === "judge-fail").map((i) => i.text)).toEqual(["hierarchy: hierarchy said fail.", "first-use: first-use said fail."]);
    expect(owner.some((i) => i.text.startsWith("copy:"))).toBe(false);
  });

  it("asks the owner to decide when design-judge fails are the only blockers", async () => {
    const { runDir, data } = await withVerdicts([
      { judge: "hierarchy", key: "b".repeat(64), verdict: "fail" },
      { judge: "coherence", key: "d".repeat(64), verdict: "fail" },
    ]);
    expect(reportStatus(data)).toEqual({ status: "blocked", text: "Blocked: 2 items need your decision." });
    expect(renderReport(data, runDir)).toContain("Blocked: 2 items need your decision.");
  });

  it("asks for fixes when a check or the copy judge fails, even with design-judge fails", async () => {
    const copy = await withVerdicts([{ judge: "copy", key: "a".repeat(64), verdict: "fail" }, { judge: "hierarchy", key: "b".repeat(64), verdict: "fail" }]);
    expect(reportStatus(copy.data).text).toBe("Blocked: fix the failures below before the owner looks.");
    const failing = { ...base, findings: [{ check: "copy" as const, rule: "doubled-punctuation", severity: "fail" as const, message: "Text has doubled punctuation." }] };
    const check = await withVerdicts([{ judge: "hierarchy", key: "b".repeat(64), verdict: "fail" }], failing);
    expect(reportStatus(check.data).text).toBe("Blocked: fix the failures below before the owner looks.");
  });

  it("says not fully judged while judge tasks are pending, and ready when none are", async () => {
    const pending = await withVerdicts([{ judge: "hierarchy", key: "b".repeat(64), verdict: "pass" }, { judge: "first-use", key: "c".repeat(64), verdict: "pass", stored: false }]);
    expect(reportStatus(pending.data)).toEqual({ status: "not-judged", text: "Not fully judged: 1 task." });
    expect(renderReport(pending.data, pending.runDir)).not.toContain("Ready for the owner");
    const result = await writeReport(pending.runDir, pending.cacheDir);
    expect(result.status).toBe("not-judged");
    expect(result.blocked).toBe(false);
    const ready = await withVerdicts([{ judge: "hierarchy", key: "b".repeat(64), verdict: "pass" }]);
    expect(reportStatus(ready.data)).toEqual({ status: "ready", text: "Ready for the owner." });
  });
});

describe("report escaping and mock paths", () => {
  it("points the mock <img src> at the file under the project root", async () => {
    const root = await mkdtemp(join(tmpdir(), "qa-root-"));
    const runDir = join(root, ".qa", "runs", "r1");
    const cacheDir = await mkdtemp(join(tmpdir(), "qa-cache-"));
    await appendStep(runDir, { ...base, mock: "mocks/a b.png" });
    const html = renderReport(await loadReportData(runDir, cacheDir), runDir);
    expect(html).toContain('<img loading="lazy" src="../../../mocks/a%20b.png" alt="Mock">');
  });

  it("escapes a bad verdict, prints ? for an unknown one, and encodes a space in a screenshot path", async () => {
    const { runDir, cacheDir } = await fixture({ ...base, screenshot: "screenshots/a b.png" });
    const data = await loadReportData(runDir, cacheDir);
    const bad = { judge: "copy", key: "e".repeat(64), reason: "r", verdict: 'fail" onmouseover="x' } as unknown as ReportData["featureVerdicts"][number];
    const odd = { judge: "copy", key: "f".repeat(64), reason: "r", verdict: "weird" } as unknown as ReportData["featureVerdicts"][number];
    data.verdicts[base.id] = [bad, odd];
    data.featureVerdicts = [bad, odd];
    data.steps = [{ ...data.steps[0]!, findings: [{ check: "c", rule: "r", severity: 'fail" onx="1', message: "m" } as never] }];
    data.visual[base.id] = { stepId: base.id, status: 'new" onx="2', ratio: 0 } as never;
    const html = renderReport(data, runDir);
    expect(html).not.toContain('" onmouseover="');
    expect(html).not.toContain('" onx="');
    expect(html).not.toContain("undefined");
    expect(html).toContain("? copy");
    expect(html).toContain('src="screenshots/a%20b.png"');
  });
});
