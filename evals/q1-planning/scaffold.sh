#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bash "$here/../scaffold-common.sh"
# The build has not started, so the project has no spec for the feature.
rm specs/property-page.spec.ts
git add -A && git -c user.email=eval@example.test -c user.name=eval commit -q --amend --no-edit
