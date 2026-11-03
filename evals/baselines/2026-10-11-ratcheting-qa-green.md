# GREEN: the ratcheting-qa skill

Date: 2026-10-12. Claude Code 2.1.287. Runs through `evals/run.sh` with `--judge-model sonnet`.
The without-arm score comes from the RED record (`2026-10-11-red.md`), not from the same run, by the budget ruling.

## RED failure that the skill answers

In all 4 RED runs of q4 (2 in each arm), the agent turned on `copy.caseRule`, ran the specs, saw the new failure and wrote the ledger row.
Then it stopped and did not fix the label. Each reply said that the owner asked only for the check, or that the owner was not available to confirm the change.
So `fixed`, `red-before-fix` and `red-first` failed in every run.

The skill text adds these lines to the brief's body, each from that failure:

- "The owner's finding is also the request to fix the code. Do not stop to ask before the fix."
- Step 3: run the catch "before you change the code", and keep the failing output.
- Rule: "A ratchet is not done until the code is fixed and the catch passes."
- Red flags: "A code change before the first run of the catch." and "A catch with no fix."

The skill names no tool for the fix and no text from the case prompt or the graders.

## q4-ratchet

Command:

```
evals/run.sh --case q4-ratchet --runs 3 -j 3 --ablation none --max-cost-usd 4 --judge-model sonnet --allow-tools Bash Write Edit --keep-temp --json evals/results/green-q4.json
```

| Run | Score | Time | Failed grader |
| --- | --- | --- | --- |
| e-VBRux4 | 1.00 | 162 s | none |
| e-C4bN4K | 0.83 | 147 s | `red-before-fix`: "after" tool Edit never called |
| e-xE9be1 | 1.00 | 106 s | none |

Mean 0.94 with the plugin, against 0.33 without it in RED. GREEN came in round 1 of the 2 allowed.

In each run the agent loaded `feature-qa:ratcheting-qa` first, added `caseRule: "sentence"`, ran `npx playwright test` and saw `copy/case-drift` fail, fixed the label, ran the specs again green, and wrote the ledger row with `qa ledger`.
Each reply showed the failing output before the fix and the passing output after it (`red-first` PASS x3 in each run).

## Ruling: the `red-before-fix` fail in e-C4bN4K is a grader limit

The order in e-C4bN4K was correct. The trace shows these tool calls:

1. Call 15: an Edit of `qa.config.ts` that adds `caseRule: "sentence"`.
2. Call 17: `npx playwright test`, with the `case-drift` failure.
3. Call 29: `sed -i '' 's/const addLabel = "Add Property";/const addLabel = "Add property";/' app/pages.mjs`, then the specs again.

The grader needs an Edit of `app/pages.mjs`. A fix by `sed` has no Edit, so the grader fails a run that is correct on order.
This is the limit that the RED record names.
The grader is not changed in this task. A fix needs one `after` side that matches an Edit or a Bash call. The `tool` key must then take more than one tool name.
Unverified: whether `tool_order` takes a pattern or a list in `tool`. I could not read the harness code or the help text in this session (the tool permission was refused).
The skill does not name Edit, by the ruling. So the grader can fail a correct run again.

## Regression: q2-running-finds-defect

Command:

```
evals/run.sh --case q2-running-finds-defect --runs 2 -j 2 --ablation none --max-cost-usd 4 --judge-model sonnet --allow-tools Bash Write Edit --json evals/results/green-q2-regress-t14.json
```

Score 1.00 in both runs. All 7 graders passed in each run, and each run loaded `running-qa`.

## Eval spend

$1.79 in total (sum of `costUsd`): q4 $0.54, q2 $1.25. The cap was $8.
