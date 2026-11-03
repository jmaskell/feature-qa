import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getVerdict, putVerdict, verdictKey } from "./cache.ts";
import { byWriteOrder, projectRootOf, readManifest, type StepRecord } from "./manifest.ts";

export type JudgeId = "copy" | "hierarchy" | "first-use" | "coherence";
export const JUDGES: Record<JudgeId, { version: string; scope: "step" | "feature"; reads: "text" | "screenshot" }> = {
  copy: { version: "1", scope: "step", reads: "text" },
  hierarchy: { version: "1", scope: "step", reads: "screenshot" },
  "first-use": { version: "1", scope: "feature", reads: "screenshot" },
  coherence: { version: "1", scope: "feature", reads: "screenshot" },
};
export const DEFAULT_RUBRIC = "Can I scan this, and do I know what the question is?";

export interface JudgeInputStep { id: string; name: string; route: string; state?: string; viewport: string; text?: string[]; names?: string[]; title?: string; screenshot?: string; mock?: string }
export interface JudgeInput { judge: JudgeId; key: string; rulesFile?: string; rubric?: string; task?: string; steps: JudgeInputStep[] }
export interface JudgeIndexEntry { judge: JudgeId; key: string; stepIds: string[]; input: string; cached: boolean }
export interface VerdictRecord { key: string; judge: JudgeId; verdict: "pass" | "fail" | "cannot-judge"; reason: string; taste?: string[]; model?: string }

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const fileText = (path: string | undefined) => (path ? readFile(path, "utf8").catch(() => "") : Promise.resolve(""));
// A rules file that the caller names must exist. An empty text would give a key that ignores the rules.
const rulesText = (path: string | undefined) => (path ? readFile(resolve(path), "utf8").catch(() => { throw new Error(`The rules file ${path} cannot be read.`); }) : Promise.resolve(""));
const judgeable = (s: StepRecord) => s.name !== "after-test" && s.screenshot !== "";

function inputStep(runDir: string, s: StepRecord, reads: "text" | "screenshot"): JudgeInputStep {
  const base: JudgeInputStep = { id: s.id, name: s.name, route: s.route, viewport: s.viewport, ...(s.state === undefined ? {} : { state: s.state }) };
  if (reads === "text") return { ...base, text: s.text, names: s.names, title: s.title };
  return { ...base, screenshot: resolve(runDir, s.screenshot), ...(s.mock === undefined ? {} : { mock: resolve(projectRootOf(runDir), s.mock) }) };
}

export async function pendingJudgeTasks(opts: {
  runDir: string; cacheDir: string; judges: JudgeId[]; rulesFile?: string; rubric?: string; task?: string; featureProject?: string;
}): Promise<JudgeIndexEntry[]> {
  const steps = (await readManifest(opts.runDir)).steps.filter(judgeable);
  const entries: JudgeIndexEntry[] = [];
  for (const judge of opts.judges) {
    const spec = JUDGES[judge];
    const groups = new Map<string, StepRecord[]>();
    if (spec.scope === "step") {
      // The key covers every input of the judge, so a change to one of them asks for a new verdict.
      const rules = judge === "copy" ? await rulesText(opts.rulesFile) : "";
      for (const s of steps) {
        const content = spec.reads === "text"
          ? sha(JSON.stringify({ text: s.text, names: s.names, title: s.title, rules }))
          : sha(JSON.stringify({ hash: s.hash, rubric: opts.rubric ?? DEFAULT_RUBRIC, mock: await fileText(s.mock && resolve(projectRootOf(opts.runDir), s.mock)) }));
        groups.set(content, [...(groups.get(content) ?? []), s]);
      }
    } else {
      const project = opts.featureProject ?? [...new Set(steps.map((s) => s.project))].sort()[0];
      // The judge sees the screens in the order the run wrote them. The key sorts by id, because parallel workers change the write order.
      const mine = steps.filter((s) => s.project === project).sort(byWriteOrder);
      const hashes = [...mine].sort((a, b) => a.id.localeCompare(b.id)).map((s) => s.hash);
      if (mine.length > 0) groups.set(sha(JSON.stringify({ hashes, task: opts.task ?? "" })), mine);
    }
    for (const [content, group] of groups) {
      const key = verdictKey(content, judge, spec.version);
      const input: JudgeInput = {
        judge, key,
        ...(judge === "copy" && opts.rulesFile ? { rulesFile: resolve(opts.rulesFile) } : {}),
        ...(judge === "hierarchy" ? { rubric: opts.rubric ?? DEFAULT_RUBRIC } : {}),
        ...(spec.scope === "feature" && opts.task ? { task: opts.task } : {}),
        // A copy task shows one step: the others have the same text.
        steps: (spec.reads === "text" ? group.slice(0, 1) : group).map((s) => inputStep(opts.runDir, s, spec.reads)),
      };
      const file = join(opts.runDir, "judge-inputs", judge, `${key}.json`);
      await mkdir(join(opts.runDir, "judge-inputs", judge), { recursive: true });
      await writeFile(file, JSON.stringify(input, null, 2));
      entries.push({ judge, key, stepIds: group.map((s) => s.id), input: file, cached: ((await getVerdict(opts.cacheDir, key))?.verdict ?? "cannot-judge") !== "cannot-judge" });
    }
  }
  const indexFile = join(opts.runDir, "judge-index.json");
  const old: JudgeIndexEntry[] = JSON.parse(await readFile(indexFile, "utf8").catch(() => "[]"));
  const merged = [...old.filter((e) => !opts.judges.includes(e.judge)), ...entries];
  await writeFile(indexFile, JSON.stringify(merged, null, 2));
  return entries.filter((e) => !e.cached);
}

const VERDICTS = new Set(["pass", "fail", "cannot-judge"]);
const REASON_MAX = 400;
const TASTE_MAX = 5;
const MODEL_MAX = 200;

/** Check a judge's output. Throw one Error that lists every problem. */
export function validateVerdicts(data: unknown): VerdictRecord[] {
  if (!Array.isArray(data)) throw new Error("The verdict file must hold a JSON array.");
  const problems: string[] = [];
  const seen = new Set<string>();
  data.forEach((r, i) => {
    const at = `item ${i}`;
    if (typeof r !== "object" || r === null) { problems.push(`${at}: not an object`); return; }
    const v = r as Record<string, unknown>;
    if (typeof v.key !== "string" || !/^[0-9a-f]{64}$/.test(v.key)) problems.push(`${at}: key must be 64 hex characters`);
    if (typeof v.key === "string") {
      if (seen.has(v.key)) problems.push(`${at}: key ${v.key.slice(0, 12)}… appears more than once`);
      seen.add(v.key);
    }
    if (typeof v.judge !== "string" || !Object.hasOwn(JUDGES, v.judge)) problems.push(`${at}: judge "${String(v.judge)}" is not known`);
    if (typeof v.verdict !== "string" || !VERDICTS.has(v.verdict)) problems.push(`${at}: verdict "${String(v.verdict)}" must be pass, fail or cannot-judge`);
    if (typeof v.reason !== "string" || v.reason.trim() === "" || v.reason.length > REASON_MAX) problems.push(`${at}: reason must be 1 to ${REASON_MAX} characters`);
    if (v.model !== undefined && (typeof v.model !== "string" || v.model.length > MODEL_MAX)) problems.push(`${at}: model must be a string of ${MODEL_MAX} characters or less`);
    if (v.taste !== undefined && (!Array.isArray(v.taste) || v.taste.length > TASTE_MAX || v.taste.some((t) => typeof t !== "string" || t.length > 200))) {
      problems.push(`${at}: taste must be at most ${TASTE_MAX} strings of 200 characters or less`);
    }
  });
  if (problems.length > 0) throw new Error(`The verdict file has problems:\n${problems.join("\n")}`);
  return data as VerdictRecord[];
}

/** Put each verdict in the cache. Refuse the whole list when one key has no input in this run. */
export async function recordVerdicts(opts: { runDir: string; cacheDir: string; records: VerdictRecord[] }): Promise<number> {
  const records = validateVerdicts(opts.records);
  for (const r of records) {
    const input = join(opts.runDir, "judge-inputs", r.judge, `${r.key}.json`);
    if (!(await access(input).then(() => true, () => false))) throw new Error(`The key ${r.key.slice(0, 12)}… has no input in this run for the ${r.judge} judge.`);
  }
  for (const r of records) {
    await putVerdict(opts.cacheDir, r.key, {
      judge: r.judge, judgeVersion: JUDGES[r.judge].version, verdict: r.verdict, reason: r.reason,
      ...(r.taste ? { taste: r.taste } : {}), ...(r.model ? { model: r.model } : {}),
    });
  }
  return records.length;
}
