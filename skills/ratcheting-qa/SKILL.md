---
name: ratcheting-qa
description: Use when the owner reports a defect that they found by hand in a feature that went through QA, to add one check or test that fails on the current code, fix the code, and add one line to the QA ledger, so the QA pass catches that kind of defect from now on.
---

# Ratcheting QA

## Why

The owner found a defect that the QA pass did not catch.
A ratchet makes the QA pass catch that kind of defect from now on.
The owner's finding is also the request to fix the code. Do not stop to ask before the fix.

## Recipe

Do every step, in this order. This recipe is enough. You do not need the kit source.

1. Name the kind of defect in one sentence, not the one instance.
2. Choose the cheapest catch, in this order:
   - an adapter option that turns on an existing rule (for example `copy.caseRule`, `copy.bannedTerms`, `designSystem.typeScale`, `actions`);
   - a new assertion in the feature's spec;
   - a new rule in the kit (only in the kit repo, with a planted defect).

   Never change a judge prompt for a defect that a script can see.
3. Make the catch. Then run it on the current code, before you change the code: `npx playwright test`. It must fail on the defect. Keep the failing output. If it passes, the catch is wrong: go back to step 2.
4. Fix the code. Run the catch again. It must pass. Run the whole QA spec to check that nothing else broke.
5. Run `npx qa ledger --what "<the owner's words>" --check "<check/rule or test path>"`.

## Rules

- One finding gives one catch.
- The catch must fail before the fix. Show the failing output in the reply.
- Never add an `ignore` entry to "fix" a finding.
- A ratchet is not done until the code is fixed and the catch passes.

## The reply

- The kind of defect.
- The catch.
- The failing output before the fix.
- The passing output after the fix.
- The ledger row.

## Red flags

- A catch that never failed.
- A code change before the first run of the catch.
- A fix with no catch.
- A catch with no fix.
- A catch that matches only the exact words of the finding.
