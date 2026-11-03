#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bash "$here/../scaffold-common.sh"
# The adapter has no case rule, and the add button uses title case for every role and defect.
grep -q 'caseRule: "sentence",' qa.config.ts
sed -i '' '/caseRule: "sentence",/d' qa.config.ts
grep -q 'const addLabel = ' app/pages.mjs
sed -i '' 's|^  const addLabel = .*$|  const addLabel = "Add Property";|' app/pages.mjs
git add -A && git -c user.email=eval@example.test -c user.name=eval commit -q --amend --no-edit
