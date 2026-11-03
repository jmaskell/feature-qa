import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { getVerdict } from "./cache.ts";
import type { JudgeIndexEntry } from "./judges.ts";
import { JUDGES } from "./judges.ts";
import { projectRootOf, readManifest, type StepRecord } from "./manifest.ts";
import type { VisualResult } from "./visual.ts";

export interface ReportVerdict { judge: string; key: string; verdict: "pass" | "fail" | "cannot-judge"; reason: string; taste?: string[] }
export interface ReportData {
  runId: string; startedAt: string; steps: StepRecord[];
  verdicts: Record<string, ReportVerdict[]>; featureVerdicts: ReportVerdict[];
  visual: Record<string, VisualResult>; pending: number;
}
export interface OwnerItem { kind: "judge-fail" | "cannot-judge" | "taste" | "visual"; stepId?: string; text: string }
export interface ReportStatus { status: "blocked" | "not-judged" | "ready"; text: string }

// A fail from these judges is a design question. The agent does not fix it, so the owner decides.
const OWNER_JUDGES = new Set(["hierarchy", "first-use", "coherence"]);

const readJson = async <T>(file: string, fallback: T): Promise<T> => readFile(file, "utf8").then((t) => JSON.parse(t) as T, () => fallback);

export async function loadReportData(runDir: string, cacheDir: string): Promise<ReportData> {
  const manifest = await readManifest(runDir);
  const index = await readJson<JudgeIndexEntry[]>(join(runDir, "judge-index.json"), []);
  const visualList = await readJson<VisualResult[]>(join(runDir, "visual.json"), []);
  const verdicts: Record<string, ReportVerdict[]> = {};
  const featureVerdicts: ReportVerdict[] = [];
  let pending = 0;
  for (const entry of index) {
    const v = await getVerdict(cacheDir, entry.key);
    if (!v) { pending++; continue; }
    const rv: ReportVerdict = { judge: entry.judge, key: entry.key, verdict: v.verdict, reason: v.reason, ...(v.taste ? { taste: v.taste } : {}) };
    if (JUDGES[entry.judge]?.scope === "feature") featureVerdicts.push(rv);
    else for (const id of entry.stepIds) (verdicts[id] ??= []).push(rv);
  }
  return { runId: manifest.runId, startedAt: manifest.startedAt, steps: manifest.steps, verdicts, featureVerdicts,
    visual: Object.fromEntries(visualList.map((r) => [r.stepId, r])), pending };
}

export function ownerList(data: ReportData): OwnerItem[] {
  const out: OwnerItem[] = [];
  const seen = new Set<string>();
  const fromVerdict = (v: ReportVerdict, stepId?: string) => {
    if (seen.has(`${v.key}|${stepId ?? ""}`)) return;
    seen.add(`${v.key}|${stepId ?? ""}`);
    if (v.verdict === "fail" && OWNER_JUDGES.has(v.judge)) out.push({ kind: "judge-fail", ...(stepId ? { stepId } : {}), text: `${v.judge}: ${v.reason}` });
    if (v.verdict === "cannot-judge") out.push({ kind: "cannot-judge", ...(stepId ? { stepId } : {}), text: `${v.judge}: ${v.reason}` });
    for (const t of v.taste ?? []) out.push({ kind: "taste", ...(stepId ? { stepId } : {}), text: `${v.judge}: ${t}` });
  };
  // A copy verdict covers several steps. Show it once, on its first step.
  const shown = new Set<string>();
  for (const [stepId, list] of Object.entries(data.verdicts)) {
    for (const v of list) { if (!shown.has(v.key)) { shown.add(v.key); fromVerdict(v, stepId); } }
  }
  for (const v of data.featureVerdicts) fromVerdict(v);
  for (const r of Object.values(data.visual)) {
    if (r.status !== "same") out.push({ kind: "visual", stepId: r.stepId, text: r.status === "new" ? "No approved baseline." : `${(r.ratio * 100).toFixed(2)}% of the pixels changed.` });
  }
  return out;
}

const allVerdicts = (data: ReportData) => [...Object.values(data.verdicts).flat(), ...data.featureVerdicts];

export function isBlocked(data: ReportData): boolean {
  return data.steps.some((s) => s.findings.some((f) => f.severity === "fail")) || allVerdicts(data).some((v) => v.verdict === "fail");
}

/** The status line of the report. Pending judge tasks do not block, but the run is not ready for the owner. */
export function reportStatus(data: ReportData): ReportStatus {
  if (isBlocked(data)) {
    const agentFails = data.steps.some((s) => s.findings.some((f) => f.severity === "fail"))
      || allVerdicts(data).some((v) => v.verdict === "fail" && !OWNER_JUDGES.has(v.judge));
    if (agentFails) return { status: "blocked", text: "Blocked: fix the failures below before the owner looks." };
    const n = ownerList(data).filter((i) => i.kind === "judge-fail").length;
    return { status: "blocked", text: `Blocked: ${n} ${n === 1 ? "item needs" : "items need"} your decision.` };
  }
  if (data.pending > 0) return { status: "not-judged", text: `Not fully judged: ${data.pending} ${data.pending === 1 ? "task" : "tasks"}.` };
  return { status: "ready", text: "Ready for the owner." };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const SYMBOL: Record<string, string> = { pass: "✓", fail: "✗", "cannot-judge": "⊘" };
const symbolOf = (verdict: string) => SYMBOL[verdict] ?? "?";
const testOf = (id: string) => id.split("/").slice(0, -2).join("/");

function mockHtml(step: StepRecord, runDir: string): string {
  if (!step.mock) return "";
  const src = esc(encodeURI(relative(runDir, resolve(projectRootOf(runDir), step.mock))));
  return /\.(png|jpe?g|webp|gif)$/i.test(step.mock)
    ? `<figure><img loading="lazy" src="${src}" alt="Mock"><figcaption>Mock</figcaption></figure>`
    : `<figure><iframe sandbox src="${src}" title="Mock"></iframe><figcaption>Mock</figcaption></figure>`;
}

function stepHtml(step: StepRecord, data: ReportData, runDir: string): string {
  const findings = step.findings.length === 0 ? "<p>No findings.</p>" : `<table><tr><th>Severity</th><th>Rule</th><th>Message</th><th>Where</th></tr>${
    step.findings.map((f) => `<tr class="${esc(f.severity)}"><td>${esc(f.severity)}</td><td>${esc(`${f.check}/${f.rule}`)}</td><td>${esc(f.message)}${f.count ? ` (${f.count}×)` : ""}</td><td><code>${esc(f.selector ?? f.sample ?? "")}</code></td></tr>`).join("")}</table>`;
  const verdicts = (data.verdicts[step.id] ?? []).map((v) => `<li class="${esc(v.verdict)}">${symbolOf(v.verdict)} ${esc(v.judge)}: ${esc(v.reason)}</li>`).join("");
  const visual = data.visual[step.id];
  const shot = step.screenshot ? `<figure><img loading="lazy" src="${esc(encodeURI(step.screenshot))}" alt="Screenshot of ${esc(step.name)}"><figcaption>Build</figcaption></figure>` : "";
  return `<article><h3>${esc(step.name)}</h3><p class="meta">${esc(step.route)} · ${esc(step.viewport)} · ${esc(step.project)}${step.state ? ` · state: ${esc(step.state)}` : ""}${visual ? ` · visual: ${esc(visual.status)}` : ""}</p>
<div class="shots">${shot}${mockHtml(step, runDir)}</div>${findings}${step.text.length ? `<details><summary>Page text (${step.text.length})</summary><ul>${step.text.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>` : ""}${verdicts ? `<ul class="verdicts">${verdicts}</ul>` : ""}</article>`;
}

export function renderReport(data: ReportData, runDir: string): string {
  const status = reportStatus(data);
  const owner = ownerList(data);
  const byTest = new Map<string, StepRecord[]>();
  for (const s of data.steps) byTest.set(testOf(s.id), [...(byTest.get(testOf(s.id)) ?? []), s]);
  const fails = data.steps.flatMap((s) => s.findings.filter((f) => f.severity === "fail")).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>QA report ${esc(data.runId)}</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1200px;padding:16px;color:#1a1a1a;background:#fff}
.status{padding:12px 16px;border-radius:6px;font-weight:600}.blocked{background:#fde8e8}.not-judged{background:#fff4d6}.ready{background:#e6f4ea}
.shots{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;max-width:100%}img,iframe{max-width:560px;width:100%;border:1px solid #ccc}
iframe{height:420px}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}
tr.fail td:first-child,li.fail{color:#a50e0e}li.cannot-judge{color:#7a5b00}article{border-top:1px solid #ddd;padding:16px 0}.meta{color:#555}
</style></head><body>
<h1>QA report</h1><p class="meta">Run ${esc(data.runId)} · started ${esc(data.startedAt)} · ${data.steps.length} steps · ${fails} failures · ${data.pending} judge tasks not done</p>
<p class="status ${status.status}">${esc(status.text)}</p>
<h2>For you</h2>${owner.length === 0 ? "<p>Nothing needs your judgement.</p>" : `<ul>${owner.map((i) => `<li>${esc(i.kind)}: ${esc(i.text)}${i.stepId ? ` <code>${esc(i.stepId)}</code>` : ""}</li>`).join("")}</ul>`}
${data.featureVerdicts.length ? `<h2>Feature judges</h2><ul>${data.featureVerdicts.map((v) => `<li class="${esc(v.verdict)}">${symbolOf(v.verdict)} ${esc(v.judge)}: ${esc(v.reason)}</li>`).join("")}</ul>` : ""}
${[...byTest].map(([test, steps]) => `<section><h2>${esc(test)}</h2>${steps.map((s) => stepHtml(s, data, runDir)).join("")}</section>`).join("")}
</body></html>`;
}

export async function writeReport(runDir: string, cacheDir: string): Promise<{ path: string; blocked: boolean; status: ReportStatus["status"]; summary: string; owner: OwnerItem[]; pending: number }> {
  const data = await loadReportData(runDir, cacheDir);
  const path = join(runDir, "report.html");
  await writeFile(path, renderReport(data, runDir));
  const status = reportStatus(data);
  return { path, blocked: status.status === "blocked", status: status.status, summary: status.text, owner: ownerList(data), pending: data.pending };
}
