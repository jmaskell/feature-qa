import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const ROOT = join(import.meta.dirname, "..", "..");

async function nested(dirty: boolean): Promise<{ code: number; out: string }> {
  const args = ["playwright", "test", "-c", "test/preflight/playwright.config.ts", "--reporter=line"];
  const env = { ...process.env, QA_PREFLIGHT_DIRTY: dirty ? "1" : "0" };
  return run("npx", args, { cwd: ROOT, env }).then((r) => ({ code: 0, out: r.stdout + r.stderr }), (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }));
}

test("a dirty start stops the run before the first test, with one message", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The nested run does not use the browser.");
  test.setTimeout(60_000);
  const dirty = await nested(true);
  expect(dirty.code).not.toBe(0);
  expect(dirty.out.match(/qa preflight: The seed database has rows from an earlier run\. Reset it\./g)).toHaveLength(1);
  expect(dirty.out).not.toContain("1 passed");
  const clean = await nested(false);
  expect(clean.code, clean.out).toBe(0);
  expect(clean.out).toContain("1 passed");
});
