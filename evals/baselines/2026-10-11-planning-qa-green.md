# GREEN: the planning-qa skill (q1)

Date: 2026-10-12. Claude Code 2.1.287. The plugin arm has the four judge agents and the `planning-qa` skill.
q1 ran 3 times in the plugin arm only (`--ablation none`), with `--judge-model sonnet`, through `evals/run.sh`.
The owner's budget allowed no new run without the plugin. The without score comes from the RED record (`2026-10-11-red.md`).

| Case | With plugin | Without plugin (RED record) | Rounds | Grader that failed |
| --- | --- | --- | --- | --- |
| q1-planning | 1.00 (3 of 3 runs pass every grader) | 0.07 | 1, then 1 re-run after review | none |

## The RED failures and the skill text that answers them

| RED failure | Skill text |
| --- | --- |
| The agent wrote a free-form plan document under its own names (`qa/7-property-page/plan.md`). | "The plan is two files, and only two", the slug rule (the plan folder name without its issue number), and "Do not put the files in a subfolder". |
| No scenario list in any run. | Recipe step 3 and the template `templates/scenarios.md`. |
| `qa skeleton` ran in 1 of 4 runs. One plugin run wrote the spec by hand. | Recipe step 2 gives the full command and the `--config` import path from `qa/`. "Never write the skeleton by hand." A red flag for a spec written before the skeleton. |
| Long runs: the agent read the kit source, ran the spec against the planted defects, and one run without the plugin hit the 900 s limit. | "You do not need the kit source." Recipe step 5: planning does not need a run. |

## What the GREEN runs did

Each run loaded the skill first, ran `npx qa skeleton --config ../qa.config.ts --out qa/property-page.spec.ts`, filled each `test.fixme` from the states table and `app/seed.mjs`, wrote `qa/property-page.scenarios.md`, and ran nothing else.
Each run took 84 to 90 seconds (the RED plugin runs took 555 and 772 seconds).
The final reply listed the files, the seed additions (none), the routes not built yet and the questions for the owner.

## Review re-run

The review removed one line from the skill: "Do not add a `state` key to a flow test". No RED trace showed that failure. The review also changed "Do not read the source of the kit" to "You do not need the kit source".
After these changes, q1 ran 3 more times with the same flags. The score was 1.00 again: all 3 runs passed every grader, in 83 to 103 seconds.

## Spend

Task 12 spent $2.13 of eval spend in total. The judge cost is $0, because q1 has no llm grader.

- Round 1: $1.02 (`costUsd` in `evals/results/green-q1.json`).
- Review re-run: $1.11 (`evals/results/green-q1-fix1.json`).
No RED run was repeated. The RED traces of the two plugin runs were still on disk and were read for the failure list.
