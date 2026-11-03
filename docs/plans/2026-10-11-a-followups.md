# Plan A follow-ups

Date: 2026-10-11. The build of Plan A left these items open. Plan B starts with the first one.

## Open findings

- gridcell/treeitem false pointer-cursor and not-a-component on read-only ARIA grids — Ruling: real and load-bearing for staff data tables; fix as the first task of the next plan (before any adopter uses role=grid); workaround is an ignore entry with a reason — cost if wrong: an adopter with an ARIA grid sees noise until then. — Done in Plan B Task 1.
- route-scoped ignore never matches watcher findings (no route on smoke/leak findings) — Ruling: fails safe; document in Plan B — cost if wrong: an adopter's route ignore silently does nothing. — Done in Plan B Task 1.
- checkReflow on every step fires resize; with viewport null it restores to 1280x800 — Ruling: acceptable now; Plan B makes it skip when viewport is null — cost if wrong: a null-viewport adopter gets a resized window. — Done in Plan B Task 1.
- checkFocus presses Shift per target — Ruling: acceptable; document — cost if wrong: an app with a Shift handler sees extra keystrokes. — Done in Plan B Task 1.
- leaks/server-log blames by time window (parallel workers or shared dev server) — Ruling: README note now via Plan B; per-test header filter later — cost if wrong: a leak gets charged to the wrong test. — Done in Plan B Task 1.

## Deferred minor findings (from per-task reviews; the final review chose to leave these)

- Task 1: minor (deferred): no test for the "anonymous" matrix role; "anonymous" not documented as reserved in types.ts. — The reserved name is documented in Plan B (types.ts, README); the test gap stays open.
- Task 1: minor (deferred): defineQaConfig accepts a role named "anonymous" and duplicate routes.
- Task 1: minor (deferred): selectorPattern not exported from index.ts.
- Task 2: minor (deferred): copy-button-length label has 8 words, registry says seven.
- Task 2: minor (deferred): interaction-escape — press Escape once in tests.
- Task 3: minor (deferred): closed <details> visibility untested; input names ignore <label>/placeholder/value; disabled ignores fieldset; tabindex="" counts as interactive; O(n·depth) style reads.
- Task 4: minor (deferred): serif-first fonts flagged unstyled; 100 ms first poll misses flash-and-revert; report-only CSP reported as fail; no test that stop() removes listeners.
- Task 5: minor (deferred): x-mode tie keeps first-seen value; display: contents/table-cell not excluded from sibling rule.
- Task 6: minor (deferred): readFocused and collectElements selectors are not asserted equal; selector builder repeated for serialisation.
- Task 7: minor (deferred): no test for warn severity in checkA11y.
- Task 8: minor (deferred): camelCase fires on iPhone15Pro-style tokens (consider an allow-list in CopyRules); "../" paths trigger doubled-punctuation; dedupe key truncates to 40 chars; empty-value check case-sensitive; missing guard tests for "?!", e.g., TEST-001, special-character banned term, "Name: Name".
- Task 9: minor (deferred): 4-character values show half after masking; data:/ws: requests not scanned; leak specs use toContain so extra findings pass.
- Task 9: minor (deferred, final review to triage): checkUrl reads searchParams, so a raw "+447…" in a query becomes " 447…" and is missed; spaced international forms (+44 7700 900201, +44 (0)7700…) not matched.
- Task 11: minor (deferred, final review to triage): expect.soft messages reach Playwright output/HTML report — confirm no check message quotes page text; document that Playwright failure screenshots/traces stay local. — The README Privacy section documents the local-only screenshots and traces in Plan B.
- Task 11: minor (deferred): no test forces a teardown error.
- Task 12: minor (deferred, final review MUST fix): smoke/unstyled is in NO_DEFECT_YET with an untrue reason — no test asserts it; add a defect or a test. — Closed: the `smoke-unstyled` defect exists.
- Task 12: minor (deferred): RULES list is hand-maintained (no grep test); "#d" selector match could collide with longer ids.
- Task 13: minor (deferred): README tree lists scripts/ with no "(Plan B)" marker; adoption step 2 is one long sentence. — Closed in Plan B.

## Rulings made during the build

- Ruling: use vitest ^5 — matches the version the first adopter runs — cost if wrong: one devDependency bump.
- Ruling: ElementInfo.style includes textOverflow from Task 3 — Task 5 needs it; adding it later reopens Task 3 — cost if wrong: one unused field.
- Ruling: the clean /tenants table sits in a scroll wrapper (overflow-x: auto) so the document does not overflow at 375 — a clean page must pass every check — cost if wrong: the fixture shows a scroll box on a phone.
- Ruling: watchSmoke collects CSP violations through page.exposeBinding, so stop() stays synchronous — the plan names this as preferred — cost if wrong: none.
- Ruling: checkAccess options are { isDenied?, beforeEach?: (context) => Promise<void> } — Task 10 step 1 text adds beforeEach — cost if wrong: none.
- Ruling: createQaTest(config) returns the result of test.extend<{ qa: Qa }>(…) with its inferred type — the conditional type in the plan is a placeholder — cost if wrong: none.
- Ruling: Task 11 qa.step builds its own ordered check list; Task 12 extracts that list into runPageChecks and makes qa.step call it — one source for the page checks — cost if wrong: one refactor in Task 12.
- Task 1: Ruling: commit trailer names the model that wrote the commit (Haiku 4.5), not Opus 5.5 — accurate attribution beats the plan's fixed text; later implementers keep their own model name — cost if wrong: cosmetic trailer edits.
- Task 2: Ruling: no log reset for leaks-log — Task 9 reads only the log lines written after watchLeaks starts (plan Task 9 step 4) — cost if wrong: a clean leak scan after a leaks-log run goes red; Task 12 would show it.
- Task 3: Ruling: accessible name falls back to innerText only for interactive elements; other elements use own text — avoids wrappers taking a child's name — cost if wrong: a check that wants a container's full text must read text, not name.
- Task 3: Ruling: ElementInfo.box stays in document coordinates; Task 6 takes before and after hover boxes both from locator.boundingBox() — one coordinate source per comparison — cost if wrong: false hover-shift findings after a scroll.
- Task 5: Ruling: the right-aligned exemption applies only when no two blocks share a left edge — a plain right-edge match hid the layout-align defect on full-width rows — cost if wrong: a right-aligned stack where two blocks share a left edge gets a false misaligned-sibling.
- Task 6: Ruling: summary counts as interactive and must show a pointer cursor; <a> without href is not interactive — matches the owner's "everything clickable" rule — cost if wrong: summary elements with a default cursor get flagged.
- Task 7: Ruling: checkReflow does not reload at all; it resizes, waits two frames + 100 ms, measures, restores — a resize already reflows; a reload loses caller state — cost if wrong: a layout that only adapts on load (JS-measured) passes reflow falsely.
- Task 8: Ruling: mixed-empty-values also reads the whole value after a 'Label:' prefix (still whole-value, never substring) — the fixture shows 'Next inspection: —' — cost if wrong: a label-prefixed sentence ending in a variant word is read as an empty value.
- Task 9: Ruling: too-many-variants counts variants over the whole DOM, hidden elements too — a hidden form is still part of the page's component set — cost if wrong: a hidden variant (e.g. in a closed panel) counts toward the limit; it contradicts the plan's hidden-element focus for this one rule only.
- Task 10: Ruling: probe-error is fail, not warn (reverses the pre-dispatch ruling) — a probe that cannot run proves nothing, and warn lets a broken signIn pass a fail-gated run — cost if wrong: a flaky sign-in fails the run until fixed.
- Ruling: Task 11 also makes src/index.ts export every public check function and type (collect, smoke, layout, interaction, a11y, copy, conformance, leaks, access, coverage) — index.ts exports only Task 1 names today; Plan B and adopters import from the package root — cost if wrong: a larger public surface to keep stable.
- Task 11: Ruling: run id comes from ensureQaRunId() called at the top of playwright.config.ts (main process sets QA_RUN_ID, workers inherit); per-worker fallback stays with a warning — cost if wrong: an adopter who skips the call gets split runs, with a warning.
- Task 12: Ruling: copy/button-length stays warn; the matrix keeps a WARN_ONLY entry that requires the warn — label length is taste, not a defect — cost if wrong: an over-long label never blocks a run.
- Task 12: Ruling: collect.ts/conformance.ts no longer treat tabindex elements with role region/group/article/list/table as interactive — a focusable scroll region is not a control — cost if wrong: a custom control built on one of those roles escapes pointer/not-a-component checks.
- Ruling: unbuilt spec items (layout overlap, forced colours, copy case drift/all names, visual, profiles, declared action) are listed in README and assigned to Plan B or later, not built in this wave — the plan never owned them — cost if wrong: Plan A is described as done while spec items remain.
- Ruling: matrix and every check spec run in WebKit too — the spec requires both browsers — cost if wrong: e2e time roughly doubles.
- Ruling: checkStyled runs inside runPageChecks as the "smoke" page check; reflow runs inside the a11y page check (new a11y-reflow defect; layout-overflow also fails a11y) — implementer decisions accepted — cost if wrong: two more checks per step.
- Ruling: pointer-cursor skips roles textbox, searchbox, listbox, tablist — composite widgets set the cursor on their children — cost if wrong: a listbox container with a default cursor is not flagged.
