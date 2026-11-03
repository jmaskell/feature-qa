import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// The published package must work from inside node_modules.
// Node and Playwright do not compile TypeScript there, so the kit must ship JavaScript.
const kit = resolve(import.meta.dirname, "../..");
const repo = resolve(kit, "../..");
let tarball = "";
let packed: string[] = [];

beforeAll(() => {
  execFileSync(process.execPath, [join(kit, "scripts/build.mjs")], { stdio: "pipe" });
  const dest = mkdtempSync(join(tmpdir(), "qa-pack-"));
  const out = execFileSync("npm", ["pack", join(kit, "build"), "--pack-destination", dest, "--json", "--workspaces=false"], { encoding: "utf8" });
  const info = JSON.parse(out)[0] as { filename: string; files: { path: string }[] };
  tarball = join(dest, info.filename);
  packed = info.files.map((f) => f.path);
}, 120_000);

function install(type: "commonjs" | "module"): string {
  const dir = mkdtempSync(join(tmpdir(), `qa-installed-${type}-`));
  writeFileSync(join(dir, "package.json"), JSON.stringify(type === "module" ? { type } : {}));
  const nm = join(dir, "node_modules");
  for (const scope of ["@playwright", "@axe-core", "@jmaskell"]) mkdirSync(join(nm, scope), { recursive: true });
  for (const name of ["@playwright/test", "playwright", "playwright-core", "@axe-core/playwright"]) {
    symlinkSync(join(repo, "node_modules", name), join(nm, name));
  }
  const dest = join(nm, "@jmaskell", "feature-qa-kit");
  mkdirSync(dest);
  execFileSync("tar", ["-xzf", tarball, "-C", dest, "--strip-components=1"]);
  return dir;
}

describe("the packed kit", () => {
  it("holds the compiled files and no source or tests", () => {
    expect(packed).toEqual(expect.arrayContaining(["package.json", "README.md", "LICENSE", "dist/index.js", "dist/index.d.ts", "dist/cli.js"]));
    expect(packed.filter((p) => !p.startsWith("dist/") && !["package.json", "README.md", "LICENSE"].includes(p))).toEqual([]);
    expect(packed.filter((p) => p.endsWith(".ts") && !p.endsWith(".d.ts"))).toEqual([]);
  });

  for (const type of ["commonjs", "module"] as const) {
    it(`runs the qa command from node_modules in a ${type} project`, () => {
      const dir = install(type);
      const r = spawnSync(process.execPath, [join(dir, "node_modules/@jmaskell/feature-qa-kit/dist/cli.js"), "ledger", "--what", "a test row", "--check", "smoke", "--file", "qa-catches.md"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(r.stderr).toBe("");
      expect(r.status).toBe(0);
      expect(existsSync(join(dir, "qa-catches.md"))).toBe(true);
    }, 60_000);

    it(`loads in a Playwright spec from node_modules in a ${type} project`, () => {
      const dir = install(type);
      writeFileSync(join(dir, "playwright.config.ts"), [
        'import { qaProjects, ensureQaRunId } from "@jmaskell/feature-qa-kit";',
        "ensureQaRunId();",
        'export default { testDir: ".", testMatch: "*.spec.ts", projects: qaProjects({ browsers: ["chromium"] }) };',
      ].join("\n"));
      writeFileSync(join(dir, "installed.spec.ts"), [
        'import { createQaTest, defineQaConfig } from "@jmaskell/feature-qa-kit";',
        'const config = defineQaConfig({ baseURL: "http://127.0.0.1:1", routes: [], roles: [], scenarios: [], accessMatrix: {} });',
        "const test = createQaTest(config);",
        'test("loads from the installed package", async () => {});',
      ].join("\n"));
      const r = spawnSync(join(repo, "node_modules/.bin/playwright"), ["test", "--list", "-c", join(dir, "playwright.config.ts")], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(r.stderr + r.stdout).toContain("loads from the installed package");
      expect(r.status).toBe(0);
    }, 60_000);
  }
});
