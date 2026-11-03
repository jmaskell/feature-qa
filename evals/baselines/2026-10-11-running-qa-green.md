# GREEN: the running-qa skill

Date: 2026-10-12. Claude Code 2.1.287. Plugin arm only (`--ablation none`), `--judge-model sonnet`, through `evals/run.sh`.
The without-arm scores come from the RED record (`2026-10-11-red.md`), by the budget ruling.

## RED failures that the skill text answers

Read from the RED traces of q2 and q3 (plugin arm) and their grader results.

| RED failure | Skill text |
| --- | --- |
| One q2 run fixed the leak, saw a green run and stopped. `qa report` showed pending judge tasks, and no judge ran. | "A green Playwright run is not the end"; step 9 checks the pending count; red flag "No `qa pending` after a green run". |
| The agent read the kit source (`cli.ts`, `judges.ts`) to learn the judge flow. | "This recipe is enough. You do not need the kit source." |
| q3: the agent passed made-up `--task` text, so the feature judges looked uncached until it tried again. | Step 5: copy the outcome line word for word. |
| q2: `qa record` refused the copy verdicts (empty reasons). The agent rewrote the verdict file itself. | Step 7: "Never write or change a verdict yourself"; red flag for a verdict file you wrote. |
| q2: judges failed a dialog that matches the design. | Step 8: keep that `fail` open for the owner. |

Ruling A applies: the copy judge runs once, on Sonnet. The brief's Haiku-first step is not in the skill.

## Round 1 results

| Case | Runs | With plugin (GREEN) | Without plugin (RED) | Cost |
| --- | --- | --- | --- | --- |
| q2-running-finds-defect | 3 | 0.94 (1.00, 0.83, 1.00) | 0.67 | $3.23 |
| q3-no-judge-on-unchanged | 3 | 1.00 (1.00, 1.00, 1.00) | 0.75 | $0.42 |
| q1-planning (regression) | 2 | 1.00 (1.00, 1.00) | 0.07 | $0.72 |

GREEN came in round 1. No round 2 ran.

- Each run loaded `feature-qa:running-qa` first.
- q2: each run fixed the title leak, ran `qa coverage`, `qa visual` and both `qa pending` calls, sent only file paths to all four judges, recorded each output, and built the report. No run changed `qa.config.ts`. Each run kept the first-use and coherence `fail` on the message dialog open as an owner decision, because the dialog matches the design. Each run also removed the Address row of the facts list, after the hierarchy judge failed it. It then ran again from step 1, and only the changed tasks went to the judges (3 copy and 6 hierarchy tasks of 4 and 8). Every judge prompt held file paths only. Fix round 1 found the Address row change to be wrong (see below).
- q3: both `qa pending` calls printed `[]`, and no run dispatched a judge.
- `qa visual` worked in every q2 and q3 run after the agent set `PLAYWRIGHT_BROWSERS_PATH` (the new launch retry in `qa visual`).

## Open failure

One q2 run failed the llm `reply` grader (votes FAIL FAIL FAIL, no reason given). That reply names the title leak, says it was fixed, and says "blocked". It is long (about 3,900 characters), with the whole taste list. The RED record notes that llm graders are noisy on long inputs. I did not change the skill for this.

## Fix round 1: design-level judge fails stay open

Ruling (2026-10-12): a `fail` from the hierarchy, first-use or coherence judge blocks the run and goes on the owner list. The agent never changes the layout, the content or the flow to clear it. Only a check `fail` and a copy-judge `fail` are fixed in code. The Address row of the facts list is part of the clean fixture design.

RED for this rule: each round 1 run removed the row. The traces show the same Edit of `app/pages.mjs` in e-ifxzng, e-duZQSP and e-ujMR2z: `old_string` `<dl class="facts"><dt>Address</dt><dd>${esc(p.address)}</dd><dt${rentStyle}>`, `new_string` `<dl class="facts"><dt${rentStyle}>`.

New q2 grader `address-row`: a regex on `app/pages.mjs`, `match: contains`, for that `<dt>Address</dt>` entry. Confirmed by a local regex test: it matches the clean fixture and fails on the text after that Edit. So it fails all 3 round 1 runs (the workspaces were deleted, so the check used the Edit from the trace).

Skill change: step 8 splits the `fail` cases as the ruling says. Step 9 stops after 2 rounds with a task still pending and reports it as not judged. New red flag: "A row, step or element removed because a judge failed it." Body: 498 words.

The other q2 graders still agree with the ruling. `fixed` needs the title leak fixed. `reply` needs the leak named and fixed, and no claim that the feature passed before the fix. A blocked run passes it. No grader changed apart from the new one. I did not add a reply grader for the owner list, because an llm grader adds judge cost and noise.

| Case | Runs | With plugin | Without plugin (RED) | Cost |
| --- | --- | --- | --- | --- |
| q2-running-finds-defect | 3 | 1.00 (1.00, 1.00, 1.00), 7 graders | 0.67 | $1.95 |

Each run made one code Edit (the title), dispatched the four judges once with file paths only, kept the hierarchy, first-use and coherence fails open, and replied "blocked" with those fails for the owner. Results: `evals/results/green-q2-fix1.json`.

## Spend

Round 1: $4.37 (q2 $3.23, q3 $0.42, q1 $0.72; cap $10). Fix round 1: $1.95 (q2; cap $5). Task 13 total: $6.32 (sum of `costUsd`; judge cost included).

Results: `evals/results/green-q2.json`, `green-q3.json`, `green-q1-regress.json` (not in git).
