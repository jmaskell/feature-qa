# Evals

The evals run Claude Code with this plugin on a small copy of a project, and grade what it does.
Each case also runs without the plugin. The difference shows what the plugin adds.

The rule: write no skill text without a failing case first.
Record the failure in `baselines/` before you write the skill.

## Cases

| Case | What it checks |
| --- | --- |
| `q0-smoke` | The sandbox can run the Playwright specs and the `qa` command. |
| `q1-planning` | A designed feature gets a QA plan: a spec made with `qa skeleton`, one step for each state, and a scenario list. |
| `q2-running-finds-defect` | The QA pass finds a planted leak of the tenant name in the page title, the agent fixes the code, and the changed screens go to the copy judge. |
| `q3-no-judge-on-unchanged` | Nothing changed, so every judge task is in the cache, and no judge runs. |
| `q4-ratchet` | An owner finding becomes a check that fails first, then passes after the fix, with a ledger row. |
| `q5-separate-qa-config` | The project has an e2e suite in `playwright.config.ts` and the QA specs in `playwright.qa.config.ts`. The QA pass runs the QA command (`npm run qa`), not the e2e suite. A guard case: it passes without the plugin too, because the `qa` script and the README line are enough. |

Each case copies `fixtures/harbour-project/`, the fixture app, the repo's `node_modules` and the kit into its workspace (`scaffold-common.sh`).
The harbour project uses the kit the way an adopter does: `qa.config.ts`, `playwright.config.ts` and one spec.

## Set up once

1. Run `npm install` at the repo root.
2. Write the Playwright browser folder into `evals/.browsers-path`, with no newline. On macOS this is normally `~/Library/Caches/ms-playwright` as a full path. `npx playwright install --dry-run chromium` prints it ("Install location"). The file is not in git.
3. Run `npm run evals:make-cache` when the harbour project, the fixture app or the kit changes what a step records. It writes `fixtures/qa-state/.qa/` for q3. Commit the result.

The `require('playwright-core/lib/server/registry/index')` API does not work here (the package does not export it), so `.browsers-path` is written by hand.

## Run one case

Use `evals/run.sh`. It adds the folders that the sandbox must read to `PATH`, then runs `claude plugin eval` with `--trust-plugin --no-publish --scaffold`:

```bash
evals/run.sh --allow-tools Bash Write Edit --judge-model sonnet \
  --case q2-running-finds-defect --runs 3 -j 3 --max-cost-usd 15 --json evals/results/q2.json
```

- Run one `--case` at a time. A second `--case` replaces the first.
- Keep `--max-cost-usd 15` for each run of a case.
- Use `--judge-model sonnet`. The default judge (haiku) gives wrong verdicts.
- Add `--keep-temp` to keep the trace at `/private/tmp/e-*/out/trace.jsonl`. The kept folder is sealed: `chmod 700` it to read it.
- Add `--ablation none` for the plugin arm only.
- Results go to `evals/results/`, which is not in git.

## Harness facts

Confirmed on Claude Code 2.1.287 by the q0 spike (2026-10-12), unless the line says otherwise.

- Case layout: cases sit at `evals/<case>/`. `plugins: ["../.."]` resolves to the repo root. The harness does not load `fixtures/` or `baselines/` as cases, because they have no `case.yaml` and no `prompt.md`.
- `schema_version: "1.1"` is accepted.
- Every behaviour case needs `--scaffold`. Bash, Write and Edit need `--allow-tools Bash Write Edit`.
- Each run gets a fresh `HOME` and a sandbox. The sandbox can read the workspace and each directory on the operator's `PATH`. It cannot read the rest of the operator's home.
- The arm with the plugin can also read the plugin folder. The arm without it cannot. So the scaffold copies `node_modules` and the kit into the workspace: links into the repo work in one arm only, and the without arm then fails for a harness reason. The first RED run (2026-10-12, kept in `evals/results/red-v1/`, not in git) had this fault.
- Even in the with arm, the sandbox refuses each symlink inside the plugin folder (`node_modules/.bin/*`, `node_modules/@feature-qa/kit`). The copies avoid this too.
- Node strips the types of the kit only outside `node_modules`. The scaffold copies the kit to `vendor/qa-kit/` and links `node_modules/@feature-qa/kit` to it.
- The sandbox cannot read through a symlink under `HOME` (for example `node/24` that points to `node/24.21.0`). `run.sh` puts the real node folder on `PATH`.
- `npx` needs the npm package folder, so `run.sh` puts it on `PATH`. In the workspace, `.npmrc` sets `script-shell=/bin/sh` (the eval `PATH` can lack `/bin`, and npx then fails with `spawn EPERM`), `offline=true` and `update-notifier=false` (the sandbox has no network).
- Playwright finds no browsers under the fresh `HOME`. `run.sh` puts the browser folder on `PATH`, so the sandbox can read it, and `.browsers-path` sets `PLAYWRIGHT_BROWSERS_PATH`.
- The sandbox cannot bind a local port: the fixture server fails with `listen EPERM`. A case cannot change this (`execution.env` takes only `EVAL_*` keys).
- Chromium cannot start its helper processes in the sandbox (`bootstrap_check_in ... Permission denied`). It runs with `--single-process --no-zygote` (confirmed in the eval by q0). One such process holds one page only, so each test needs its own browser. The multi-process failure is confirmed under a local copy of the eval sandbox profile, and the port failure in the eval itself.
- So the harbour project has `eval-sandbox.ts`. When the workspace has the file `.eval-sandbox`, `inEvalSandbox(test)` gives each test a new single-process browser, and the browser context gets each page from `app/respond.mjs` through `context.route`. Chromium does not route the request that follows a fulfilled redirect, so the handler follows redirects itself. The address bar keeps the first URL.
- WebKit does not start in the sandbox. The harbour project uses Chromium only. Unverified in the eval itself: confirmed under a local copy of the eval sandbox profile.
- `qa visual` launches its own Chromium. When the first launch throws, it launches again with `--single-process --no-zygote`. In the eval it then works, but only with `PLAYWRIGHT_BROWSERS_PATH` set: it does not read `.browsers-path` (seen in each GREEN run of q2 and q3, 2026-10-12).
- The step hash is the same in the sandbox and outside it, and the same with the in-browser app and with the server. Confirmed by two runs on this machine in each mode.
- The llm grader key is `focus`. A file-focus grader needs an exact path. `file_exists` takes a glob. Regex `match: count:N` passes only for exactly N matches (product-design notes, 2.1.285).
- A `tool_used: Skill` grader with `arm: both` counts in the score of both arms (the RED q3 with arm scored 0.75: three of four graders).
- A `tool_order` grader takes `before: {tool, input_match}` and `after: {tool, input_match}`. Each side takes the first matching call, and the grader fails when a side has no match (read from the 2.1.287 grader code, and seen in the q4 fix-round runs).
- The subagent tool is `Agent` in the trace (product-design notes, 2.1.285).

## The q3 cache

`npm run evals:make-cache` (`fixtures/make-cache.mjs`) scaffolds a temporary workspace, runs the specs once, and runs `qa pending` for all four judges with `--rules copy-rules.md`.
A feature judge key covers the task text. So it asks three times: with the outcome line of `issue.md`, with that line without its `Outcome:` label, and with no task.
It records a `pass` verdict with the reason "Recorded for the eval." for each task, then copies `.qa/cache` and the run into `fixtures/qa-state/.qa/`.
The screenshots hold fake data only.
