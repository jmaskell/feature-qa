#!/usr/bin/env node
// Builds the package that goes to the registry, in build/.
// The source package exports TypeScript. Node and Playwright do not compile TypeScript in node_modules.
// So the published package holds the compiled JavaScript and the type files.
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kit = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(kit, "..", "..");
const out = join(kit, "build");

rmSync(out, { recursive: true, force: true });
execFileSync(join(repo, "node_modules", ".bin", "tsc"), ["-p", join(kit, "tsconfig.build.json")], { stdio: "inherit" });
chmodSync(join(out, "dist", "cli.js"), 0o755);

const src = JSON.parse(readFileSync(join(kit, "package.json"), "utf8"));
const pkg = {
  name: src.name,
  version: src.version,
  description: src.description,
  license: src.license,
  repository: src.repository,
  type: "module",
  engines: src.engines,
  exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
  bin: { qa: "./dist/cli.js" },
  peerDependencies: src.peerDependencies,
  dependencies: src.dependencies,
  publishConfig: src.publishConfig,
};
writeFileSync(join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
copyFileSync(join(repo, "README.md"), join(out, "README.md"));
copyFileSync(join(repo, "LICENSE"), join(out, "LICENSE"));
console.log(`built ${pkg.name}@${pkg.version} in ${out}`);
