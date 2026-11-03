#!/usr/bin/env bash
# Run the eval suite with the paths that the eval sandbox must read.
# The sandbox can read only the directories on PATH, the plugin folder and the workspace.
# It cannot follow a link under HOME, so node goes on PATH by its real folder.
# npx needs the npm package, and Playwright needs the browser folder, so both go on PATH too.
# Usage: evals/run.sh --case q0-smoke --runs 1 --ablation none --allow-tools Bash --json evals/results/q0.json
set -euo pipefail
cd "$(dirname "$0")/.."
node_bin="$(dirname "$(realpath "$(command -v node)")")"
npm_dir="$(dirname "$(dirname "$(realpath "$(command -v npx)")")")"
if [ ! -f evals/.browsers-path ]; then
  echo "evals/.browsers-path is missing. Write the Playwright browser folder into it (see evals/README.md)." >&2
  exit 2
fi
browsers="$(cat evals/.browsers-path)"
# evals/.env can hold an API key for eval runs. It is git-ignored.
# The script loads it only when EVAL_USE_API_KEY=1. Otherwise the runs use the signed-in Claude account.
if [ "${EVAL_USE_API_KEY:-0}" = "1" ] && [ -f evals/.env ]; then set -a; . evals/.env; set +a; fi
PATH="$node_bin:$npm_dir:$browsers:$PATH" exec claude plugin eval . --trust-plugin --no-publish --scaffold "$@"
