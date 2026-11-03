#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bash "$here/../scaffold-common.sh"
# One earlier run, and a pass verdict in the cache for each judge task of that run (npm run evals:make-cache).
cp -R "$here/../fixtures/qa-state/.qa" .qa
git add -A && git -c user.email=eval@example.test -c user.name=eval commit -q --amend --no-edit
