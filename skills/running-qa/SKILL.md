---
name: running-qa
description: Use when a feature's build is done or changed and the owner has not yet looked at it, to run the scripted QA checks, send only the changed screens to the judge agents, fix what fails, and build one report for the owner.
---

# Running QA

## Recipe

Do every step, in this order. After a green run, the judges and the report still come.
This recipe is enough. You do not need the kit source.

1. Start the app or reuse the running server that `playwright.config.ts` names. Run all the specs: `npx playwright test`.
2. For each test that failed on a `fail` finding, fix the code, not the check or the adapter. Run `npx playwright test --last-failed`. At most 3 attempts for each step, then keep the failure in the report. After a fix, run all the specs once more: the next steps read the latest run, and a `--last-failed` run has only those tests.
3. Run in one shell call:
   `npx qa coverage --design … --issue …; npx qa visual; npx qa pending --judges copy,hierarchy,first-use,coherence --rules <copy.rulesFile from qa.config.ts> --task "<the outcome line of issue.md>"`
   - No design: leave out `qa coverage`. A missing state or criterion is a failure: add the test.
   - Copy the outcome line word for word, or the cached verdicts do not match.
4. When `qa pending` prints `[]`, dispatch no judge. Otherwise dispatch one agent (`copy-judge`, `hierarchy-judge`, `first-use-judge`, `coherence-judge`) for each judge that has tasks, all in one message. Give each agent only its input file paths and one output path under `.qa/`, no build context.
5. Run `npx qa record <output> <output> …` with all outputs in one call. If it exits 2, send the error text to the judge of each bad file once, then record that file again. Never write or change a verdict yourself.
6. A `fail` from the copy judge: fix all of them, run all the specs once, then go back to step 3. A `fail` from another judge: do not change the layout, content or flow. `qa report` lists it for the owner. A taste item does not block.
7. Run `npx qa report`. When it prints pending judge tasks, go back to step 3. After 2 rounds with a task still pending, report it as not judged. Stop.

## Rules

- Never weaken a check, an `ignore` entry or the seed values to make a run pass. An `ignore` entry needs the owner's reason.
- Never run against a hosted production system.
- Never paste page text into a judge dispatch.

## The reply

- The report path.
- The status line (`summary`) of `qa report`.
- The fixes made: the defect, its cause and the change.
- The owner list from `qa report` (judge fails, `⊘`, taste, visual) and nothing else.
- What was not tested, for example a step that did not run.

## Red flags

- A judge dispatched when `qa pending` printed `[]`.
- No `qa pending` after a green run.
- A changed `qa.config.ts` in a fix.
- A verdict file that you wrote or changed.
- A row, step or element removed because a judge failed it.
- "Passed" with an open `fail`.
