# RED baseline: q5-separate-qa-config

Date: 2026-10-12. Claude Code 2.1.287. The skill text is as at commit 2f4a558: running-qa step 1 says `npx playwright test`.
The case ran 3 times in each arm, with `--judge-model sonnet`, through `evals/run.sh`:

```bash
evals/run.sh --allow-tools Bash Write Edit --judge-model sonnet \
  --case q5-separate-qa-config --runs 3 -j 3 --max-cost-usd 15 --json evals/results/q5-red.json
```

The workspace has two Playwright configs. `playwright.config.ts` runs one plain e2e test. `playwright.qa.config.ts` runs the QA specs. `package.json` has the script `qa`, and `README.md` says "QA specs: `npm run qa`."

## Scores

The score is the mean share of passing graders.

| Arm | Run 1 | Run 2 | Run 3 | Mean |
| --- | --- | --- | --- | --- |
| With plugin | 1.00 | 1.00 | 1.00 | 1.00 |
| Without plugin | 1.00 | 0.67 | 0.33 | 0.67 |

| Grader | With plugin | Without plugin |
| --- | --- | --- |
| `qa-config` (a Bash call runs `npm run qa` or `-c playwright.qa.config.ts`) | 3 of 3 | 3 of 3 |
| `report-ran` (a Bash call runs `qa report`) | 3 of 3 | 1 of 3 |
| `reply-report` (the reply names a `.qa/runs/*/report.html` path) | 3 of 3 | 2 of 3 |

## Result

The with arm passed `qa-config` in all 3 runs. The current skill text did not make the agent run the e2e suite in place of the QA specs. So this RED does not fail, and the skill does not change.
The without arm also ran the QA config in all 3 runs, so the project's `qa` script and README line are enough for the agent to find the QA command.

## Second run (fix round 1)

The review asked for proof that the running-qa skill fired. Two grader changes:

- `skill.md` (copied from q2) needs a Skill call that loads `running-qa`.
- `qa-config.md` is stricter. The Bash command must start with `npm run qa` (also after `&&` or `;`), or run `playwright test -c playwright.qa.config.ts`. A `grep` or `cat` that names `npm run qa` does not match.

Command: the same as above, with `--ablation none --keep-temp --json evals/results/q5-red2.json` (with arm only).

| Arm | Run 1 | Run 2 | Run 3 | `skill` | `qa-config` | `report-ran` | `reply-report` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| With plugin | 1.00 | 1.00 | 1.00 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |

What the kept traces show. In each run, the first tool call loads `feature-qa:running-qa`. Then the agent reads `playwright.config.ts`, `playwright.qa.config.ts`, `package.json` and `README.md`, and then runs the QA suite:

- Run 1: `npx playwright test -c playwright.qa.config.ts 2>&1 | tail -80`
- Run 2: `npm run qa 2>&1 | tail -80`
- Run 3: `npm run qa 2>&1 | tail -80`. Before it, this run also ran the e2e suite once (`npx playwright test`, in a call that also read the specs), then ran the QA command.

So the skill fires, and the agent finds the QA command from the project files, even with step 1 as it is. The result stays: the skill does not change.

Eval spend: $6.87 in total. The first run cost $4.80 (`evals/results/q5-red.json`) and the second run $2.07 (`evals/results/q5-red2.json`). Neither file is in git.
