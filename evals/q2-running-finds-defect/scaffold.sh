#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bash "$here/../scaffold-common.sh"
# Plant one source bug: the page title holds the tenant name.
old='const title = ctx.defect === "leaks-title" && t ? t.name : "Property details";'
new='const title = t ? t.name : "Property details";'
grep -qF 'const title = ctx.defect === "leaks-title" && t ? t.name : "Property details";' app/pages.mjs
sed -i '' "s|$old|$new|" app/pages.mjs
grep -qF "$new" app/pages.mjs
git add -A && git -c user.email=eval@example.test -c user.name=eval commit -q --amend --no-edit
