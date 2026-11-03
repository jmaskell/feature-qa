#!/usr/bin/env node
// The qa command. Each subcommand prints JSON to stdout.
// Exit codes: 0 done, 1 a blocking result, 2 a usage error or bad input.
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { coverage } from "./checks/coverage.ts";
import { compareRuns } from "./compare.ts";
import { appendLedger } from "./ledger.ts";
import { defaultCacheDir, latestRunDir, readManifest } from "./manifest.ts";
import { loadPlaywright } from "./playwright.ts";
import { parseCriteria, parseFlows, parseStates, specSkeleton } from "./spec.ts";
import { JUDGES, pendingJudgeTasks, recordVerdicts, validateVerdicts, type JudgeId } from "./judges.ts";
import { writeReport } from "./report.ts";
import { timingTable } from "./timing.ts";
import { approveBaselines, defaultBaselineDir, diffRun } from "./visual.ts";

class UsageError extends Error {}

const USAGE = `Usage: qa <command> [options]
  latest                                   print the latest run directory
  pending --judges <list> [--rules f] [--rubric t] [--task t] [--run d]
  record <verdicts.json...> [--run d]
  visual [--run d] [--baselines d]
  approve [--run d] [--baselines d] [step ids...]
  report [--run d]
  skeleton --design <design.md> --issue <issue.md> --feature <name> --config <import path> --out <file>
  coverage --design <design.md> --issue <issue.md> [--run d]
  ledger --what <text> --check <check or test> [--file qa-catches.md] [--date YYYY-MM-DD]
  timings [--run d]                        median, p95 and max milliseconds of each step part
  compare <runA> <runB>                    the findings that differ between two runs; exit 1 when any differ`;

async function runOf(value: string | undefined): Promise<string> {
  const dir = value ?? (await latestRunDir());
  if (!dir) throw new UsageError("No run found in .qa/runs. Run the Playwright specs first.");
  return resolve(dir);
}

type Command = (args: string[]) => Promise<{ out: unknown; code?: number }>;

/**
 * Launch the browser for qa visual. Some sandboxes stop Chromium from starting its helper processes.
 * When the first launch throws, launch again as one process.
 */
export async function launchVisualBrowser<B>(launch: (opts?: { args?: string[] }) => Promise<B>): Promise<B> {
  try {
    return await launch();
  } catch {
    return await launch({ args: ["--single-process", "--no-zygote"] });
  }
}

export const COMMANDS: Record<string, Command> = {
  async latest() {
    return { out: { runDir: await runOf(undefined) } };
  },
  async pending(args) {
    const { values } = parseArgs({ args, options: { judges: { type: "string" }, rules: { type: "string" }, rubric: { type: "string" }, task: { type: "string" }, run: { type: "string" } } });
    const judges = (values.judges ?? "").split(",").filter(Boolean) as JudgeId[];
    const unknown = judges.filter((j) => !Object.hasOwn(JUDGES, j));
    if (judges.length === 0 || unknown.length > 0) throw new UsageError(`--judges must list known judges: ${Object.keys(JUDGES).join(", ")}`);
    if (values.rules) await readFile(values.rules, "utf8").catch(() => { throw new UsageError(`The --rules file ${values.rules} cannot be read.`); });
    const out = await pendingJudgeTasks({ runDir: await runOf(values.run), cacheDir: defaultCacheDir(), judges,
      ...(values.rules ? { rulesFile: values.rules } : {}), ...(values.rubric ? { rubric: values.rubric } : {}), ...(values.task ? { task: values.task } : {}) });
    return { out };
  },
  async record(args) {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { run: { type: "string" } } });
    if (positionals.length === 0) throw new UsageError("record needs a verdict file.");
    const runDir = await runOf(values.run);
    // Each file is recorded on its own. A bad file does not stop the good files, so a retry sends only the bad one.
    let recorded = 0;
    const failed: { file: string; error: string }[] = [];
    for (const file of positionals) {
      try {
        let data: unknown;
        try { data = JSON.parse(await readFile(file, "utf8")); } catch { throw new Error(`${file} is not valid JSON.`); }
        recorded += await recordVerdicts({ runDir, cacheDir: defaultCacheDir(), records: validateVerdicts(data) });
      } catch (e) {
        failed.push({ file, error: (e as Error).message });
      }
    }
    for (const f of failed) process.stderr.write(`qa record: ${f.file}: ${f.error}\n`);
    return { out: failed.length > 0 ? { recorded, failed } : { recorded }, code: failed.length > 0 ? 2 : 0 };
  },
  async visual(args) {
    const { values } = parseArgs({ args, options: { run: { type: "string" }, baselines: { type: "string" } } });
    const { chromium } = loadPlaywright();
    const browser = await launchVisualBrowser((opts) => chromium.launch(opts));
    try {
      return { out: await diffRun({ runDir: await runOf(values.run), baselineDir: values.baselines ?? defaultBaselineDir(), browser }) };
    } finally {
      await browser.close();
    }
  },
  async approve(args) {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { run: { type: "string" }, baselines: { type: "string" } } });
    const approved = await approveBaselines(await runOf(values.run), values.baselines ?? defaultBaselineDir(), positionals.length ? positionals : undefined);
    return { out: { approved } };
  },
  async report(args) {
    const { values } = parseArgs({ args, options: { run: { type: "string" } } });
    const result = await writeReport(await runOf(values.run), defaultCacheDir());
    return { out: result, code: result.blocked ? 1 : 0 };
  },
  async skeleton(args) {
    const { values } = parseArgs({ args, options: { design: { type: "string" }, issue: { type: "string" }, feature: { type: "string" }, config: { type: "string" }, out: { type: "string" } } });
    const { design, issue, feature, config, out } = values;
    if (!design || !issue || !feature || !config || !out) throw new UsageError("skeleton needs --design, --issue, --feature, --config and --out.");
    const designMd = await readFile(design, "utf8");
    const states = parseStates(designMd);
    if (states.length === 0) throw new UsageError(`${design} has no "## States" table that starts with "| Screen | State |".`);
    const criteria = parseCriteria(await readFile(issue, "utf8"));
    const flows = parseFlows(designMd);
    try {
      await writeFile(out, specSkeleton({ feature, configImport: config, states, criteria, flows }), { flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new UsageError(`${out} exists. Choose another --out.`);
      throw e;
    }
    return { out: { out, states: states.length, criteria: criteria.length, flows: flows.length } };
  },
  async coverage(args) {
    const { values } = parseArgs({ args, options: { design: { type: "string" }, issue: { type: "string" }, run: { type: "string" } } });
    if (!values.design || !values.issue) throw new UsageError("coverage needs --design and --issue.");
    const states = parseStates(await readFile(values.design, "utf8")).map((s) => s.id);
    const criteria = parseCriteria(await readFile(values.issue, "utf8")).map((c) => c.id);
    if (criteria.length === 0) throw new UsageError(`${values.issue} has no acceptance criteria. It needs a "## Acceptance criteria" list.`);
    const { steps } = await readManifest(await runOf(values.run));
    const found = coverage({ states, criteria, steps });
    return { out: found, code: found.length > 0 ? 1 : 0 };
  },
  async ledger(args) {
    const { values } = parseArgs({ args, options: { what: { type: "string" }, check: { type: "string" }, file: { type: "string" }, date: { type: "string" } } });
    if (!values.what || !values.check) throw new UsageError("ledger needs --what and --check.");
    const file = values.file ?? "qa-catches.md";
    await appendLedger(file, { date: values.date ?? new Date().toISOString().slice(0, 10), what: values.what, check: values.check });
    return { out: { file } };
  },
  async timings(args) {
    const { values } = parseArgs({ args, options: { run: { type: "string" } } });
    const { steps } = await readManifest(await runOf(values.run));
    return { out: timingTable(steps) };
  },
  async compare(args) {
    const { positionals } = parseArgs({ args, allowPositionals: true, options: {} });
    if (positionals.length !== 2) throw new UsageError("compare needs two run directories.");
    const [a, b] = await Promise.all(positionals.map(async (dir) => {
      const { steps } = await readManifest(resolve(dir));
      if (steps.length === 0) throw new UsageError(`${dir} has no step records.`);
      return steps;
    }));
    const out = compareRuns(a!, b!);
    return { out, code: out.same ? 0 : 1 };
  },
};

export async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  const command = name ? COMMANDS[name] : undefined;
  if (!command) { process.stderr.write(`${USAGE}\n`); return 2; }
  try {
    const { out, code } = await command(rest);
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return code ?? 0;
  } catch (e) {
    process.stderr.write(`qa ${name}: ${(e as Error).message}\n`);
    return e instanceof UsageError || (e as { code?: string }).code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ? 2 : 1;
  }
}

// npx runs the command through a symlink in node_modules/.bin, so compare real paths.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
