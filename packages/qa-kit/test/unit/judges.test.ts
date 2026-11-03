import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getVerdict } from "../../src/cache.ts";
import { appendStep, type StepRecord } from "../../src/manifest.ts";
import { pendingJudgeTasks, recordVerdicts, validateVerdicts } from "../../src/judges.ts";

function step(id: string, viewport: string, text: string[], hash: string, project = "chromium"): StepRecord {
  return { id: `${project}/spec/t/01-home/${viewport}-${id}`, name: "home", route: "/", viewport, project,
    screenshot: `screenshots/${id}.png`, text, names: [], title: "Home", aria: "", findings: [], hash };
}

async function run(steps: StepRecord[]) {
  const runDir = await mkdtemp(join(tmpdir(), "qa-run-"));
  const cacheDir = await mkdtemp(join(tmpdir(), "qa-cache-"));
  for (const s of steps) await appendStep(runDir, s);
  return { runDir, cacheDir };
}

describe("pendingJudgeTasks", () => {
  it("gives one copy task for the same text at two widths, and one hierarchy task for each screenshot", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1"), step("b", "1280x800", ["Hello"], "h2")]);
    const tasks = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy", "hierarchy"] });
    expect(tasks.filter((t) => t.judge === "copy").map((t) => t.stepIds.length)).toEqual([2]);
    expect(tasks.filter((t) => t.judge === "hierarchy")).toHaveLength(2);
    const input = JSON.parse(await readFile(tasks[0]!.input, "utf8"));
    expect(input.steps[0].text).toEqual(["Hello"]);
  });

  it("skips the after-test record and steps with no screenshot", async () => {
    const after = { ...step("c", "375x812", [], "h3"), name: "after-test", screenshot: "" };
    const { runDir, cacheDir } = await run([after]);
    expect(await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy", "hierarchy"] })).toEqual([]);
  });

  it("returns nothing for a judge whose verdict is cached, and marks it cached in the index", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1")]);
    const [task] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"] });
    await recordVerdicts({ runDir, cacheDir, records: [{ key: task!.key, judge: "copy", verdict: "pass", reason: "Plain words." }] });
    expect(await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"] })).toEqual([]);
    const index = JSON.parse(await readFile(join(runDir, "judge-index.json"), "utf8"));
    expect(index.map((e: { cached: boolean }) => e.cached)).toEqual([true]);
  });

  it("gives one feature task over the steps of one project", async () => {
    const { runDir, cacheDir } = await run([
      step("a", "375x812", ["A"], "h1", "chromium"), step("b", "375x812", ["B"], "h2", "chromium"), step("c", "375x812", ["C"], "h3", "webkit"),
    ]);
    const tasks = await pendingJudgeTasks({ runDir, cacheDir, judges: ["first-use"], task: "Find a property." });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.stepIds).toHaveLength(2);
    expect(JSON.parse(await readFile(tasks[0]!.input, "utf8")).task).toBe("Find a property.");
  });

  it("shows the feature judge the steps in the order the run wrote them, not by id", async () => {
    const first = { ...step("z", "375x812", ["Search"], "h1"), id: "chromium/spec/zeta-search/01-search/375x812", seq: 1 };
    const second = { ...step("a", "375x812", ["Result"], "h2"), id: "chromium/spec/alpha-result/01-result/375x812", seq: 2 };
    const { runDir, cacheDir } = await run([second, first]);
    const [task] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["first-use"], task: "Find a property." });
    const input = JSON.parse(await readFile(task!.input, "utf8"));
    expect(input.steps.map((s: { id: string }) => s.id)).toEqual([first.id, second.id]);
  });

  it("keeps the feature key when only the write order changes", async () => {
    const a = { ...step("a", "375x812", ["A"], "h1"), seq: 1 };
    const b = { ...step("b", "375x812", ["B"], "h2"), seq: 2 };
    const one = await run([a, b]);
    const two = await run([{ ...a, seq: 2 }, { ...b, seq: 1 }]);
    const [k1] = await pendingJudgeTasks({ ...one, judges: ["coherence"] });
    const [k2] = await pendingJudgeTasks({ ...two, judges: ["coherence"] });
    expect(k1!.key).toBe(k2!.key);
  });

  it("throws when the rules file is missing", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1")]);
    await expect(pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"], rulesFile: join(runDir, "no-such-rules.md") })).rejects.toThrow(/no-such-rules\.md/);
  });
});

describe("validateVerdicts and recordVerdicts", () => {
  it("lists every problem and records nothing", async () => {
    expect(() => validateVerdicts([{ key: "k", judge: "copy", verdict: "maybe", reason: "" }, { judge: "nope" }]))
      .toThrow(/verdict.*maybe[\s\S]*reason[\s\S]*judge.*nope/);
    expect(() => validateVerdicts("not a list")).toThrow(/array/);
  });

  it("refuses a key that has no input in the run", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1")]);
    await expect(recordVerdicts({ runDir, cacheDir, records: [{ key: "f".repeat(64), judge: "copy", verdict: "pass", reason: "x" }] }))
      .rejects.toThrow(/no input/);
  });

  it("refuses a key that appears twice", () => {
    const key = "cd".repeat(32);
    const rec = { key, judge: "copy", verdict: "pass", reason: "x" };
    expect(() => validateVerdicts([rec, rec])).toThrow(new RegExp(`${key.slice(0, 12)}`));
  });

  it("stores the verdict with the judge version", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1")]);
    const [task] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"] });
    await recordVerdicts({ runDir, cacheDir, records: [{ key: task!.key, judge: "copy", verdict: "fail", reason: "Jargon.", taste: ["Shorter heading"] }] });
    expect(await getVerdict(cacheDir, task!.key)).toMatchObject({ judge: "copy", judgeVersion: "1", verdict: "fail", taste: ["Shorter heading"] });
  });
});

describe("cache key inputs", () => {
  it("gives a new task when the hash changes", async () => {
    const a = await run([step("a", "375x812", ["Hello"], "h1")]);
    const [t1] = await pendingJudgeTasks({ ...a, judges: ["hierarchy"] });
    await recordVerdicts({ ...a, records: [{ key: t1!.key, judge: "hierarchy", verdict: "pass", reason: "ok" }] });
    const b = await run([step("a", "375x812", ["Hello"], "h2")]);
    const [t2] = await pendingJudgeTasks({ runDir: b.runDir, cacheDir: a.cacheDir, judges: ["hierarchy"] });
    expect(t2!.key).not.toBe(t1!.key);
  });

  it("gives a new copy task when the rules file changes", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1")]);
    const rulesFile = join(runDir, "rules.md");
    await writeFile(rulesFile, "Use plain words.");
    const [t1] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"], rulesFile });
    await writeFile(rulesFile, "Use short words.");
    const [t2] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"], rulesFile });
    expect(t2!.key).not.toBe(t1!.key);
  });

  it("gives a new hierarchy task when the rubric or the mock changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "qa-root-"));
    const runDir = join(root, ".qa", "runs", "r1");
    const cacheDir = await mkdtemp(join(tmpdir(), "qa-cache-"));
    await appendStep(runDir, { ...step("a", "375x812", ["Hello"], "h1"), mock: join("mocks", "a.png") });
    const [t1] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["hierarchy"], rubric: "R1" });
    const [t2] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["hierarchy"], rubric: "R2" });
    expect(t2!.key).not.toBe(t1!.key);
    const mock = join(root, "mocks", "a.png");
    await mkdir(join(root, "mocks"), { recursive: true });
    await writeFile(mock, "one");
    const [t3] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["hierarchy"], rubric: "R2" });
    await writeFile(mock, "two");
    const [t4] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["hierarchy"], rubric: "R2" });
    expect(t3!.key).not.toBe(t2!.key);
    expect(t4!.key).not.toBe(t3!.key);
  });

  it("gives a new feature task when the task text changes", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["A"], "h1")]);
    const [t1] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["first-use"], task: "One." });
    const [t2] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["first-use"], task: "Two." });
    expect(t2!.key).not.toBe(t1!.key);
  });
});

describe("cannot-judge and validation", () => {
  it("returns a task again after a cannot-judge verdict, and still stores the verdict", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1")]);
    const [task] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"] });
    await recordVerdicts({ runDir, cacheDir, records: [{ key: task!.key, judge: "copy", verdict: "cannot-judge", reason: "No text." }] });
    expect((await getVerdict(cacheDir, task!.key))?.verdict).toBe("cannot-judge");
    const again = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"] });
    expect(again.map((t) => t.key)).toEqual([task!.key]);
    const index = JSON.parse(await readFile(join(runDir, "judge-index.json"), "utf8"));
    expect(index.map((e: { cached: boolean }) => e.cached)).toEqual([false]);
  });

  it("refuses the judge constructor and a long model name", () => {
    const base = { key: "a".repeat(64), verdict: "pass", reason: "x" };
    expect(() => validateVerdicts([{ ...base, judge: "constructor" }])).toThrow(/judge/);
    expect(() => validateVerdicts([{ ...base, judge: "copy", model: "m".repeat(201) }])).toThrow(/model/);
    expect(validateVerdicts([{ ...base, judge: "copy", model: "m" }])).toHaveLength(1);
  });

  it("writes nothing when the second record has no input", async () => {
    const { runDir, cacheDir } = await run([step("a", "375x812", ["Hello"], "h1")]);
    const [task] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["copy"] });
    await expect(recordVerdicts({ runDir, cacheDir, records: [
      { key: task!.key, judge: "copy", verdict: "pass", reason: "x" },
      { key: "f".repeat(64), judge: "copy", verdict: "pass", reason: "x" },
    ] })).rejects.toThrow(/no input/);
    expect(await getVerdict(cacheDir, task!.key)).toBeNull();
  });
});

describe("mock path", () => {
  it("resolves against the project root, not the current directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "qa-root-"));
    const runDir = join(root, ".qa", "runs", "r1");
    const cacheDir = await mkdtemp(join(tmpdir(), "qa-cache-"));
    await mkdir(join(root, "mocks"), { recursive: true });
    await writeFile(join(root, "mocks", "a.png"), "mock-bytes");
    await appendStep(runDir, { ...step("a", "375x812", ["Hello"], "h1"), mock: "mocks/a.png" });
    const [task] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["hierarchy"] });
    const input = JSON.parse(await readFile(task!.input, "utf8"));
    expect(input.steps[0].mock).toBe(join(root, "mocks", "a.png"));
    // The key covers the mock bytes, so a change to the file gives a new key.
    await writeFile(join(root, "mocks", "a.png"), "other-bytes");
    const [again] = await pendingJudgeTasks({ runDir, cacheDir, judges: ["hierarchy"] });
    expect(again!.key).not.toBe(task!.key);
  });
});
