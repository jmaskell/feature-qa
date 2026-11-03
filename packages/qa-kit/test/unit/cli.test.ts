import { execFile } from "node:child_process";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { appendStep } from "../../src/manifest.ts";

const CLI = resolve(import.meta.dirname, "../../src/cli.ts");
const exec = promisify(execFile);
async function qa(cwd: string, ...args: string[]) {
  try {
    const { stdout } = await exec("node", [CLI, ...args], { cwd });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { code: number; stdout: string; stderr: string };
    return { code: err.code, out: err.stdout, err: err.stderr };
  }
}

describe("qa command", () => {
  it("exits 2 with usage text for an unknown command", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    const r = await qa(cwd, "nope");
    expect(r.code).toBe(2);
  });

  it("finds the latest run, lists pending tasks, and records verdicts", async () => {
    // The child process reports the real path, and on macOS tmpdir() is a symlink.
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "qa-cli-")));
    const runDir = join(cwd, ".qa", "runs", "r1");
    await appendStep(runDir, { id: "chromium/s/t/01-a/375x812", name: "a", route: "/", viewport: "375x812", project: "chromium",
      screenshot: "screenshots/a.png", text: ["Hi"], names: [], title: "", aria: "", findings: [], hash: "h" });
    expect(JSON.parse((await qa(cwd, "latest")).out).runDir).toBe(runDir);
    const pending = JSON.parse((await qa(cwd, "pending", "--judges", "copy")).out);
    expect(pending).toHaveLength(1);
    const file = join(cwd, "v.json");
    await writeFile(file, JSON.stringify([{ key: pending[0].key, judge: "copy", verdict: "pass", reason: "Fine." }]));
    expect(JSON.parse((await qa(cwd, "record", file)).out)).toEqual({ recorded: 1 });
    expect(JSON.parse((await qa(cwd, "pending", "--judges", "copy")).out)).toEqual([]);
  });

  it("prints absolute paths from qa pending, also for a relative --run", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await appendStep(join(cwd, ".qa", "runs", "r1"), { id: "c/s/t/01-a/1x1", name: "a", route: "/", viewport: "1x1", project: "c",
      screenshot: "s.png", text: ["Hi"], names: [], title: "", aria: "", findings: [], hash: "h" });
    const pending = JSON.parse((await qa(cwd, "pending", "--judges", "copy", "--run", ".qa/runs/r1")).out);
    expect(pending).toHaveLength(1);
    for (const p of pending) expect(isAbsolute(p.input)).toBe(true);
  });

  it("qa record exits 2 and names the key prefix when a file has one key twice", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await appendStep(join(cwd, ".qa", "runs", "r1"), { id: "c/s/t/01-a/1x1", name: "a", route: "/", viewport: "1x1", project: "c",
      screenshot: "s.png", text: [], names: [], title: "", aria: "", findings: [], hash: "h" });
    const key = "ab".repeat(32);
    const file = join(cwd, "v.json");
    const rec = { key, judge: "copy", verdict: "pass", reason: "Fine." };
    await writeFile(file, JSON.stringify([rec, rec]));
    const r = await qa(cwd, "record", file);
    expect(r.code).toBe(2);
    expect(r.err).toContain(key.slice(0, 12));
  });

  it("exits 2 for the judge name constructor", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await appendStep(join(cwd, ".qa", "runs", "r1"), { id: "c/s/t/01-a/1x1", name: "a", route: "/", viewport: "1x1", project: "c",
      screenshot: "s.png", text: [], names: [], title: "", aria: "", findings: [], hash: "h" });
    expect((await qa(cwd, "pending", "--judges", "constructor")).code).toBe(2);
  });

  it("qa record takes several files, records the good ones and names the bad one", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "qa-cli-")));
    await appendStep(join(cwd, ".qa", "runs", "r1"), { id: "c/s/t/01-a/1x1", name: "a", route: "/", viewport: "1x1", project: "c",
      screenshot: "s.png", text: ["Hi"], names: [], title: "", aria: "", findings: [], hash: "h" });
    const pending = JSON.parse((await qa(cwd, "pending", "--judges", "copy,hierarchy")).out);
    expect(pending).toHaveLength(2);
    const files = pending.map((p: { judge: string; key: string }) => {
      const file = join(cwd, `${p.judge}.json`);
      return { file, rec: { key: p.key, judge: p.judge, verdict: "pass", reason: "Fine." } };
    });
    for (const { file, rec } of files) await writeFile(file, JSON.stringify([rec]));
    const bad = join(cwd, "bad.json");
    await writeFile(bad, "{not json");
    const r = await qa(cwd, "record", files[0].file, bad, files[1].file);
    expect(r.code).toBe(2);
    expect(r.err).toContain("bad.json");
    expect(JSON.parse(r.out)).toMatchObject({ recorded: 2, failed: [{ file: bad }] });
    expect(JSON.parse((await qa(cwd, "pending", "--judges", "copy,hierarchy")).out)).toEqual([]);
  });

  it("exits 2 and records nothing for a bad verdict file", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await appendStep(join(cwd, ".qa", "runs", "r1"), { id: "c/s/t/01-a/1x1", name: "a", route: "/", viewport: "1x1", project: "c",
      screenshot: "s.png", text: [], names: [], title: "", aria: "", findings: [], hash: "h" });
    const file = join(cwd, "v.json");
    await writeFile(file, "{not json");
    expect((await qa(cwd, "record", file)).code).toBe(2);
  });

  it("skeleton refuses a design with no States table", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await writeFile(join(cwd, "design.md"), "# Design\n");
    await writeFile(join(cwd, "issue.md"), "## Acceptance criteria\n- [ ] x\n");
    const r = await qa(cwd, "skeleton", "--design", "design.md", "--issue", "issue.md", "--feature", "F", "--config", "./qa.config.ts", "--out", "f.spec.ts");
    expect(r.code).toBe(2);
  });

  it("coverage exits 1 when a state is not reached", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await writeFile(join(cwd, "design.md"), "## States\n| Screen | State | Sees | How |\n|---|---|---|---|\n| P | Let | x | y |\n");
    await writeFile(join(cwd, "issue.md"), "## Acceptance criteria\n- [ ] x\n");
    await appendStep(join(cwd, ".qa", "runs", "r1"), { id: "c/s/t/01-a/1x1", name: "a", route: "/", viewport: "1x1", project: "c",
      screenshot: "s.png", text: [], names: [], title: "", aria: "", findings: [], hash: "h", state: "P: Let" });
    const r = await qa(cwd, "coverage", "--design", "design.md", "--issue", "issue.md");
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).map((f: { rule: string }) => f.rule)).toEqual(["criterion-without-test"]);
  });
});

describe("qa command input checks", () => {
  const step = { id: "c/s/t/01-a/1x1", name: "a", route: "/", viewport: "1x1", project: "c",
    screenshot: "s.png", text: [], names: [], title: "", aria: "", findings: [], hash: "h" };

  it("report exits 0 and says not fully judged while a judge task is pending", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await appendStep(join(cwd, ".qa", "runs", "r1"), step);
    await qa(cwd, "pending", "--judges", "hierarchy");
    const r = await qa(cwd, "report");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ blocked: false, status: "not-judged", pending: 1 });
  });

  it("pending exits 2 when the --rules file is missing", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await appendStep(join(cwd, ".qa", "runs", "r1"), step);
    const r = await qa(cwd, "pending", "--judges", "copy", "--rules", "no-such-rules.md");
    expect(r.code).toBe(2);
    expect(r.err).toContain("no-such-rules.md");
  });

  it("coverage exits 2 when the issue gives no criteria", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "qa-cli-"));
    await writeFile(join(cwd, "design.md"), "## States\n| Screen | State | Sees | How |\n|---|---|---|---|\n| P | Let | x | y |\n");
    await writeFile(join(cwd, "issue.md"), "## Criteria\n- [ ] x\n");
    await appendStep(join(cwd, ".qa", "runs", "r1"), { ...step, state: "P: Let" });
    const r = await qa(cwd, "coverage", "--design", "design.md", "--issue", "issue.md");
    expect(r.code).toBe(2);
    expect(r.err).toContain("issue.md");
  });
});

describe("qa visual browser launch", () => {
  it("launches again as one process when the first launch throws", async () => {
    const { launchVisualBrowser } = await import("../../src/cli.ts");
    const calls: unknown[] = [];
    const browser = { name: "b" };
    const launch = async (opts?: { args?: string[] }) => {
      calls.push(opts);
      if (calls.length === 1) throw new Error("bootstrap_check_in: Permission denied");
      return browser;
    };
    expect(await launchVisualBrowser(launch)).toBe(browser);
    expect(calls).toEqual([undefined, { args: ["--single-process", "--no-zygote"] }]);
  });

  it("launches once when the first launch works", async () => {
    const { launchVisualBrowser } = await import("../../src/cli.ts");
    const calls: unknown[] = [];
    await launchVisualBrowser(async (opts?: { args?: string[] }) => { calls.push(opts); return {}; });
    expect(calls).toEqual([undefined]);
  });
});
