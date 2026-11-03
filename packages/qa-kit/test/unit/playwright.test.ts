import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPlaywright } from "../../src/playwright.ts";

function project(withPlaywright: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "qa-pw-"));
  writeFileSync(join(dir, "package.json"), "{}");
  if (withPlaywright) {
    const pkg = join(dir, "node_modules", "@playwright", "test");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@playwright/test", main: "index.js" }));
    writeFileSync(join(pkg, "index.js"), "module.exports = { marker: 'project copy' };");
  }
  return dir;
}

describe("loadPlaywright", () => {
  it("loads the project's copy of @playwright/test", () => {
    expect((loadPlaywright(project(true)) as unknown as { marker: string }).marker).toBe("project copy");
  });

  it("throws an error from the project's copy and does not fall back", () => {
    const dir = project(true);
    writeFileSync(join(dir, "node_modules", "@playwright", "test", "index.js"), "throw new Error('broken copy');");
    expect(() => loadPlaywright(dir)).toThrow("broken copy");
  });

  it("rethrows a missing dependency of the project's copy, not the clear error", () => {
    const dir = project(true);
    writeFileSync(join(dir, "node_modules", "@playwright", "test", "index.js"), "require('left-pad-xyz');");
    expect(() => loadPlaywright(dir)).toThrow(/Cannot find module 'left-pad-xyz'/);
    expect(() => loadPlaywright(dir)).not.toThrow(/feature-qa: no @playwright\/test/);
  });

  it("throws a clear error when the project has no @playwright/test", () => {
    const dir = project(false);
    expect(() => loadPlaywright(dir)).toThrow(`feature-qa: no @playwright/test in ${dir}.`);
  });
});

describe("the kit in a CommonJS project", () => {
  it("loads when the project package.json has no type field", () => {
    const repo = resolve(import.meta.dirname, "../../../..");
    const dir = mkdtempSync(join(tmpdir(), "qa-cjs-"));
    writeFileSync(join(dir, "package.json"), "{}");
    mkdirSync(join(dir, "node_modules", "@playwright"), { recursive: true });
    mkdirSync(join(dir, "node_modules", "@jmaskell"), { recursive: true });
    symlinkSync(join(repo, "node_modules/@playwright/test"), join(dir, "node_modules/@playwright/test"));
    symlinkSync(join(repo, "node_modules/playwright"), join(dir, "node_modules/playwright"));
    symlinkSync(join(repo, "node_modules/playwright-core"), join(dir, "node_modules/playwright-core"));
    symlinkSync(join(repo, "packages/qa-kit"), join(dir, "node_modules/@jmaskell/feature-qa-kit"));
    writeFileSync(join(dir, "playwright.config.ts"), [
      'import { qaProjects, ensureQaRunId } from "@jmaskell/feature-qa-kit";',
      "ensureQaRunId();",
      'export default { testDir: ".", testMatch: "*.spec.ts", projects: qaProjects({ browsers: ["chromium"] }) };',
    ].join("\n"));
    writeFileSync(join(dir, "cjs.spec.ts"), [
      'import { createQaTest, defineQaConfig } from "@jmaskell/feature-qa-kit";',
      'const config = defineQaConfig({ baseURL: "http://127.0.0.1:1", routes: [], roles: [], scenarios: [], accessMatrix: {} });',
      "const test = createQaTest(config);",
      'test("loads in a CommonJS project", async () => {});',
    ].join("\n"));
    const r = spawnSync(join(repo, "node_modules/.bin/playwright"), ["test", "--list", "-c", join(dir, "playwright.config.ts")], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(r.stderr + r.stdout).toContain("loads in a CommonJS project");
    expect(r.status).toBe(0);
  }, 60_000);
});
