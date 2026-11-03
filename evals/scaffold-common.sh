#!/usr/bin/env bash
# Copy the harbour project, the fixture app, the kit and the repo's packages into the eval workspace.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
cp -R "$here/fixtures/harbour-project/." .
mkdir -p app && cp -R "$repo/fixtures/lettings-app/." app/
# Copy, do not link: the arm without the plugin cannot read the plugin folder, and both arms must run the same tools.
# Node strips the types of the kit only outside node_modules, so the kit goes to vendor/ with a link to it.
cp -R "$repo/node_modules" node_modules
mkdir -p vendor/qa-kit && cp -R "$repo/packages/qa-kit/package.json" "$repo/packages/qa-kit/src" vendor/qa-kit/
rm node_modules/@feature-qa/kit && ln -s ../../vendor/qa-kit node_modules/@feature-qa/kit
if [ -f "$here/.browsers-path" ]; then cp "$here/.browsers-path" .browsers-path; fi
# The harbour project reads this marker: no web server, the app is served inside the browser (eval-sandbox.ts).
: > .eval-sandbox
# The sandbox has no network, and the eval PATH can lack /bin. Keep npx offline, and give it the full path of sh.
printf '%s\n' update-notifier=false offline=true script-shell=/bin/sh > .npmrc
printf '%s\n' node_modules/ vendor/ .qa/ test-results/ > .gitignore
git init -q && git add -A && git -c user.email=eval@example.test -c user.name=eval commit -qm "scaffold"
