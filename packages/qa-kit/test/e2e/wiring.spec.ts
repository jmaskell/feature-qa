import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { readManifest } from "../../src/manifest.ts";

const run = promisify(execFile);
const ROOT = join(import.meta.dirname, "..", "..");

interface JsonResult { status: string; errors: Array<{ message?: string }> }
interface JsonSpec { title: string; tests: Array<{ results: JsonResult[] }> }
interface JsonSuite { specs?: JsonSpec[]; suites?: JsonSuite[] }

function specsOf(suite: JsonSuite): JsonSpec[] {
  return [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(specsOf)];
}

// Proves the per-test wiring of createQaTest: the watchers write an after-test record, and a "fail" finding fails the test.
test("createQaTest records after-test findings and fails the test with their message", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const runId = `wiring-${testInfo.project.name}-${Date.now()}`;
  const args = ["playwright", "test", "-c", "test/wiring/playwright.config.ts", `--project=${testInfo.project.name}`, "--reporter=json"];
  const out = await run("npx", args, { cwd: ROOT, env: { ...process.env, QA_RUN_ID: runId }, maxBuffer: 16 * 1024 * 1024 })
    .then((r) => r.stdout, (e: { stdout?: string }) => e.stdout ?? "");
  const report = JSON.parse(out) as { suites: JsonSuite[] };
  const specs = report.suites.flatMap(specsOf);
  const errorsOf = (title: string) => {
    const spec = specs.find((s) => s.title === title);
    expect(spec, `nested spec "${title}"`).toBeDefined();
    const result = spec!.tests[0]!.results[0]!;
    expect(result.status).toBe("failed");
    return result.errors.map((e) => e.message ?? "").join("\n");
  };
  expect(errorsOf("smoke console")).toContain("smoke/console-error: The page wrote a console error");
  expect(errorsOf("leaks title")).toContain("leaks/title: A page title holds a personal value.");

  const manifest = await readManifest(join(ROOT, ".qa", "runs", runId));
  const afterTest = (slug: string) => manifest.steps.find((s) => s.name === "after-test" && s.id.includes(`/${slug}/after-test/`));
  expect(afterTest("smoke-console")?.findings.map((f) => `${f.check}/${f.rule}`)).toContain("smoke/console-error");
  expect(afterTest("leaks-title")?.findings.map((f) => `${f.check}/${f.rule}`)).toContain("leaks/title");
});
