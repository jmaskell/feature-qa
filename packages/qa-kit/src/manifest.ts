import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { Timings } from "./timing.ts";
import type { Finding } from "./types.ts";

export interface StepRecord {
  id: string; // "<project>/<spec file>/<test title>/<NN>-<step slug>/<viewport>", all slugs
  name: string;
  route: string;
  state?: string;
  mock?: string; // path to the mock region (PNG or HTML), relative to the project root
  criteria?: string[];
  viewport: string;
  project: string;
  screenshot: string; // path relative to the run directory
  text: string[];
  names: string[];
  title: string;
  aria: string;
  findings: Finding[];
  hash: string; // sha256 of the screenshot bytes and the JSON of text, names and title
  /** The write order in the run: a millisecond time with a fraction, which all workers on one machine share. Older records have none. */
  seq?: number;
  /** Milliseconds for each part of the step: the capture, each check and its parts. See `qa timings`. */
  timings?: Timings;
}

export interface RunManifest {
  runId: string;
  startedAt: string;
  steps: StepRecord[];
}

let autoRunId: string | undefined;

function timestampId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Set QA_RUN_ID when it is missing, and return it.
 * Call it at the top of playwright.config.ts. The main process sets it before the workers start,
 * and every worker inherits it, so one run keeps one directory even when Playwright starts a new worker.
 */
export function ensureQaRunId(): string {
  process.env.QA_RUN_ID ||= timestampId();
  return process.env.QA_RUN_ID;
}

/** The default verdict cache directory: ".qa/cache" under root (default: the current directory). */
export function defaultCacheDir(root: string = process.cwd()): string {
  return join(root, ".qa", "cache");
}

/** True when QA_RUN_ID is set. */
export function hasQaRunId(): boolean {
  return Boolean(process.env.QA_RUN_ID);
}

/**
 * Return ".qa/runs/<runId>" under root (default: the current directory).
 * The run id is QA_RUN_ID when set (see ensureQaRunId). Otherwise it is a timestamp that each worker makes once,
 * and workers do not share a run directory.
 */
export function runDir(root: string = process.cwd()): string {
  autoRunId ??= timestampId();
  return join(root, ".qa", "runs", process.env.QA_RUN_ID || autoRunId);
}

/** The project root of a run directory. A run directory is <root>/.qa/runs/<id>. */
export function projectRootOf(runDir: string): string {
  return resolve(runDir, "..", "..", "..");
}

/** Write steps/<id>.json. Each step has its own file, so parallel workers never write the same file. */
export async function appendStep(dir: string, step: StepRecord): Promise<void> {
  // The id becomes a file path. It must stay inside the run directory.
  if (isAbsolute(step.id) || step.id.startsWith("/") || step.id.split(/[\\/]/).some((part) => part === ".." || part === "")) {
    throw new Error("step id must be a relative path with no empty or .. segment");
  }
  const file = join(dir, "steps", `${step.id}.json`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(step, null, 2));
  // "wx" fails when the file exists, so the first worker sets the start time.
  await writeFile(join(dir, "run.json"), JSON.stringify({ startedAt: new Date().toISOString() }), { flag: "wx" }).catch((e) => {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  });
}

async function jsonFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await jsonFiles(path)));
    else if (entry.name.endsWith(".json")) out.push(path);
  }
  return out;
}

/** A run-wide write order for a new step record. */
export function nextSeq(): number {
  return performance.timeOrigin + performance.now();
}

/** Sort steps in the order the run wrote them. A step with no seq goes last. The id breaks a tie. */
export function byWriteOrder(a: StepRecord, b: StepRecord): number {
  return (a.seq ?? Infinity) - (b.seq ?? Infinity) || a.id.localeCompare(b.id);
}

export async function readManifest(dir: string): Promise<RunManifest> {
  const steps: StepRecord[] = [];
  for (const file of (await jsonFiles(join(dir, "steps"))).sort()) {
    steps.push(JSON.parse(await readFile(file, "utf8")) as StepRecord);
  }
  const run = await readFile(join(dir, "run.json"), "utf8").then((t) => JSON.parse(t) as { startedAt: string }, () => null);
  return { runId: basename(dir), startedAt: run?.startedAt ?? "", steps };
}

/** The run directory under <root>/.qa/runs whose run.json changed last, or null when there is none. */
export async function latestRunDir(root: string = process.cwd()): Promise<string | null> {
  const base = join(root, ".qa", "runs");
  let best: { dir: string; time: number } | null = null;
  for (const entry of await readdir(base, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const dir = join(base, entry.name);
    const time = await stat(join(dir, "run.json")).then((s) => s.mtimeMs, () => -1);
    if (time >= 0 && (best === null || time > best.time)) best = { dir, time };
  }
  return best?.dir ?? null;
}
