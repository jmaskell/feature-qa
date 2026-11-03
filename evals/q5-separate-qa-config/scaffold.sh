#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bash "$here/../scaffold-common.sh"
# The project already has an e2e suite in playwright.config.ts, so the QA specs have their own config.
mv playwright.config.ts playwright.qa.config.ts
mkdir -p e2e
cat > playwright.config.ts <<'TS'
import { defineConfig } from "@playwright/test";

// The e2e suite. The QA specs have their own config: playwright.qa.config.ts.
export default defineConfig({ testDir: "./e2e" });
TS
cat > e2e/smoke.spec.ts <<'TS'
import { expect, test } from "@playwright/test";

test("the e2e suite runs", () => {
  expect(1 + 1).toBe(2);
});
TS
node -e '
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts = { ...pkg.scripts, qa: "playwright test -c playwright.qa.config.ts" };
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
printf '%s\n' 'QA specs: `npm run qa`.' >> README.md
git add -A && git -c user.email=eval@example.test -c user.name=eval commit -q --amend --no-edit
