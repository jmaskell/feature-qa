#!/usr/bin/env node
// Make evals/fixtures/qa-state/.qa: one run of the harbour project, and a pass verdict in the cache
// for each judge task of that run. The q3 case copies it, so a skill that runs the QA pass again
// finds every judge task in the cache.
// The run uses the same scaffold as the cases, so it renders the same pages in the same browser mode.
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const evals = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(evals, "fixtures", "qa-state", ".qa");
const work = await mkdtemp(join(tmpdir(), "qa-state-"));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

try {
  run("bash", [join(evals, "scaffold-common.sh")]);
  run("npx", ["playwright", "test"]);

  // The key of a feature judge covers the task text. A skill can pass the outcome line with or without
  // its "Outcome:" label, or no task. Store a verdict for each of the three, so each one is in the cache.
  const outcome = (await readFile(join(work, "docs/plans/7-property-page/issue.md"), "utf8")).split("\n").find((l) => l.startsWith("Outcome:"));
  if (!outcome) throw new Error("issue.md has no Outcome: line");
  const tasks = [outcome, outcome.replace(/^Outcome:\s*/, ""), undefined];
  const pending = [];
  for (const task of tasks) {
    const args = ["qa", "pending", "--judges", "copy,hierarchy,first-use,coherence", "--rules", "copy-rules.md", ...(task ? ["--task", task] : [])];
    pending.push(...JSON.parse(run("npx", args)));
  }
  const keys = new Map(pending.map((e) => [e.key, { key: e.key, judge: e.judge, verdict: "pass", reason: "Recorded for the eval." }]));
  await writeFile(join(work, "verdicts.json"), JSON.stringify([...keys.values()], null, 2));
  run("npx", ["qa", "record", "verdicts.json"]);

  // Keep the cache and the run. Leave out the judge inputs: they hold paths of this temporary folder.
  const runs = await readdir(join(work, ".qa", "runs"));
  if (runs.length !== 1) throw new Error(`expected one run, found ${runs.length}`);
  await rm(out, { recursive: true, force: true });
  await cp(join(work, ".qa", "cache"), join(out, "cache"), { recursive: true });
  await cp(join(work, ".qa", "runs", runs[0]), join(out, "runs", runs[0]), {
    recursive: true,
    filter: (src) => !src.includes(`${runs[0]}/judge-inputs`) && !src.endsWith("judge-index.json"),
  });
  console.log(`Wrote ${out}: run ${runs[0]}, ${keys.size} cached verdicts.`);
} finally {
  await rm(work, { recursive: true, force: true });
}
