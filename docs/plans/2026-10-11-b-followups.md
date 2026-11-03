# Plan B follow-ups

Date: 2026-10-12. The build of Plan B left these items open. Plan C (the first project adapter) starts with the ones that block an adopter.

## Parked eval facts

- The copy judge runs on Sonnet only, with no Haiku-first step. A/B on 8 labelled inputs, 2 runs each: Haiku cost $0.075 and $0.079 and was right 8/8 both times, but run 2 wrote an invalid file (a reason over 400 characters) that `qa record` refuses. Sonnet cost $0.119 for each run, was right 8/8 both times, and wrote valid files. Spec section 4.4 and `agents/copy-judge.md` say Sonnet.
- The GREEN runs compared the with-plugin arm against the without-arm scores of the RED runs, because of the owner's budget cap. Judge noise between two runs is not controlled. Re-run both arms in one run when the budget allows.
- Eval totals for the GREEN rounds: q1 1.00 (RED without 0.07), q2 0.94 (0.67), q3 1.00 (0.75), q4 0.94 (0.33).
- Eval runs bill to a key in the git-ignored `evals/.env`. `evals/run.sh` loads it. Never commit it.

## Deferred minor findings (from per-task reviews)

- Task 1: minor (deferred): README "A control is…" paragraph does not say gridcell/treeitem are controls with a tabindex.
- Task 1: minor (deferred): treeitem not in NO_POINTER_ROLES (focusable tree item may get pointer-cursor).
- Task 1: minor (deferred): grid shows £950 unformatted vs money().
- Task 1: minor (deferred): reflow-skipped warns on every step with a null viewport; text duplicated in README Known limits and Checks.
- Task 2: minor (deferred): no test that qa.step actionsAs runs actions and applies ignore; role-unset path untested.
- Task 2: minor (deferred): dialog overlap skip matches tag prefix "dialog" only; role="dialog"/aria-modal dialogs not covered; dialog e2e test was never RED (regression guard only).
- Task 3: minor (deferred): README scan note omits label-echo; h2–h6/th may hold record data (README should point adapters at properNouns); clause split on "e.g."/"No." misses drift only; no copyRules test for title rule or leading quote.
- Task 4: minor (deferred): input type=button/submit with background only is exempt as a form field; display:none child text gives a false pass.
- Task 5: minor (deferred): text-scale test title claims "before page scripts" but checks final size only; extraViewport/extras subsets untested; README profiles snippet lacks defineConfig import; !important html rule beats the inline scale.
- Task 6: minor (deferred): diffRun throws on a missing screenshot file (no visual.json written); step.id used as baseline path unguarded (kit-made ids only); no diffRun test for the "changed" outcome.
- Task 7: minor (deferred): cli maps every recordVerdicts error (incl. disk I/O) to exit 2; mock path resolves against the cwd of `qa pending`; duplicate keys in one verdict file overwrite silently.
- Task 7: minor (deferred): a missing --rules file hashes as "" with no warning; the mock test writes ./mocks under the cwd, not a temp dir.
- Task 8: minor (deferred): severity/verdict/visual.status go into HTML unescaped (enum values from disk files); SYMBOL lookup can print "undefined"; image src not URL-encoded; no test that a fail verdict blocks, nor for featureVerdicts, reason/taste escaping, the details list or the report exit code; redundant seen/shown sets.
- Task 9: minor (deferred): parseStates reads every pipe line in the section (a second table adds bogus states); indented sub-bullets become AC ids; exact heading match only; skeleton refusal test is green for any exit 2; no ledger CLI test, --date not validated; coverage ignores IT flow ids.
- Task 10: minor (deferred): `qa pending` prints input paths relative when --run is relative (the interface says absolute).
- Task 10: minor (deferred): first-use/coherence judges lack a "script already checks"/"not true-or-false" line; check-plugin skill and plugin.json branches untested; missing plugin.json reported as "not valid JSON".
- Task 11: minor (deferred): states count:4 is exact; q3 no-judge passes trivially in the without arm (guard); sed -i '' BSD-only; skill graders with arm: both cap scores; cached step hashes are machine-bound (README should say); a q1 skeleton spec cannot run in the sandbox (no inEvalSandbox wrapper) — Task 12 must not need it to run.
- Task 11: minor (deferred): q4 order grader pass path unproven inside the eval (checked by hand on an old trace); a fix by sed/Write fails it; q4 RED separation weak (0.33/0.33); one q1 without run timed out.
- Task 13: minor (deferred): no q2 grader on the owner-list reply; SKILL body at 498/500 words; `qa visual` does not read .browsers-path (agent set PLAYWRIGHT_BROWSERS_PATH by hand in the eval); one q2 reply grader fail on a long reply.
- Task 14: minor (deferred): "do not stop to ask before the fix" has no limit for a layout/flow change (should defer to the owner like running-qa); hard-codes `npx playwright test`; two long sentences.

## Rulings made during the build

- Ruling: the portability check stays case-insensitive; skill/agent text avoids the verb "react" — catches "react"/"REACT" stack mentions — cost if wrong: one reworded sentence.
- Ruling: the user's earlier instruction ("do all … unattended") stands for Plan B, so execution starts without a separate plan review — cost if wrong: the owner reviews the plan after the build and asks for rework.
- Ruling: eval spend per case run has a cost cap that the owner set — the owner asked for evals like product-design — cost if wrong: money spent on runs the owner did not want.
- Task 3: note — a stale fixture server (reuseExistingServer: true) served old pages; implementer rules now say to stop it before a full run. Ruling: keep reuseExistingServer — adopters use it to point at a running dev server — cost if wrong: one more stale-server confusion.
- Task 7: Ruling: the judge cache key also covers the rules file content, the rubric, the feature task and the mock bytes — spec §3.4 "the model sees only what changed" means a changed judge input must re-judge; the plan's key shape was too narrow — cost if wrong: extra judge calls after a rules edit.
- Task 7: Ruling: a stored cannot-judge verdict counts as pending (re-judged next run) but stays in the cache so the report shows ⊘ — a non-answer must not lock in; the owner still sees it — cost if wrong: repeat judge calls for a step that can never be judged.
- Task 8: Ruling: the report shows each step's page text in a closed <details> list (escaped) — the plan's test expected escaped page text but the plan's render never printed it; the owner can also read the copy the judge saw — cost if wrong: a longer report page.
- Task 10: Ruling: brief step 5 (dispatch copy-judge on real inputs) runs in the controller after the task review, not in the implementer — implementers never dispatch subagents — cost if wrong: none; the same check runs one step later.
- Task 10: Ruling: fix the guard with pathToFileURL(realpathSync(argv[1])) like cli.ts — the plan's guard can silently skip the gate — cost if wrong: none.
- Ruling: eval budget for Tasks 12–14 has a total cap and a per-case-run cap, with room for one regression run each — cost if wrong: fewer GREEN rounds than the plan allows.
- Ruling: GREEN runs use --ablation none (with-plugin arm only) and compare against the without-arm scores already in the RED results; each case run has a cost cap — the RED baseline already holds the without arm — cost if wrong: arm comparison spans two runs, so judge noise between runs is not controlled.
- Task 11: Ruling: accept the sandbox adapter (fixtures/lettings-app/respond.mjs, harbour eval-sandbox.ts serving through context.route with single-process Chromium) — the eval sandbox cannot bind a port; step hashes match real-server runs — cost if wrong: the evals test a different serving path than adopters use.
- Ruling: eval spend is at the controller's discretion within the owner's limit; GREEN runs go back to both arms in one run (product-design lesson: compare arms within one run) — cost if wrong: more spend than with-arm-only.
- Task 11: Ruling: q4 gets a tool_order grader (a qa check run before the Edit of app/pages.mjs) so a fix without a failing catch first cannot score — the ratchet's point is "fails before the fix" — cost if wrong: a correct run that edits first then adds the check scores lower.
- Task 11: Ruling: replace q1 values llm grader with regex graders on spec-given values — llm judges are noisy on long files — cost if wrong: the grader checks presence of values, not that no value was invented.
- Ruling: spend plan — Tasks 12–14 GREEN with --ablation none, --runs 3, compared with the RED without arm, about $25 in total; stop at the owner's limit — cost if wrong: weaker arm comparison and fewer GREEN rounds.
- Task 12: Ruling: take the Minor "state key on a flow test" line out of the skill now — it answers a grader, not a recorded failure, which breaks the global "no skill text without a failing eval" rule — cost if wrong: q1 may need one more GREEN run (~$1).
- Ruling: the copy judge runs on Sonnet 5.5 only, with no Haiku-first step — with 5 of 8 inputs flagged, Haiku plus a Sonnet re-check of each flag costs more than Sonnet alone, and Haiku broke the output contract in 1 of 2 runs; owner reported the same result elsewhere — cost if wrong: about 50% more per copy-judge call on screens with no flags. Spec §4.4 row and agents/copy-judge.md change in Task 13.
- Task 13: Ruling: `qa visual` retries the Chromium launch with --single-process --no-zygote when the normal launch fails — the eval sandbox cannot run multi-process Chromium, and running-qa runs `qa visual` — cost if wrong: none outside sandboxes (the retry only runs after a failed launch).
- Task 13: Ruling: a design-level judge fail (hierarchy, first-use, coherence) blocks the run and goes on the owner list; the agent never changes layout, content or flow to clear it; only check fails and copy-judge fails are fixed in code — spec §3.1 "a model judges only is this good", and design calls belong to the owner — cost if wrong: the owner sees composition fails the agent could have fixed alone.
- Task 13: Ruling: RED for this text = a new q2 grader that the Address row stays, failing on the current GREEN traces; then GREEN — keeps "no skill text without a failing eval" — cost if wrong: ~$3.5 more key spend.
- Ruling: the running-qa reply-line change (judge fails go on the owner list) shipped with a q2 regression run, not a new RED case — the change only lets the reply carry the judge fails that step 8 already sends to the owner — cost if wrong: the reply change is less tested than the rest of the skill.
