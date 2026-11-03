---
name: planning-qa
description: Use when a feature has a design.md (states table) and an issue.md (acceptance criteria) and its build has not started or has just started, to write the QA scenario list and a Playwright spec skeleton whose expected values come from the spec and the seed data, not from the build.
---

# Planning QA

## Why

The builder must not write the expected values, because a builder checks what they built, not what was asked.
The spec and the seed data give every expected value.

## Recipe

The plan is two files, and only two: `qa/<slug>.spec.ts` and `qa/<slug>.scenarios.md`.
The slug is the name of the feature's plan folder without its issue number.
Do not write a free-form plan document. Do not put the files in a subfolder.

1. Find `design.md` and `issue.md` of the feature. Read the seed data and `qa.config.ts`. If no `qa.config.ts` exists, copy `templates/qa.config.ts` (two levels above this skill's directory) and fill it from the project. You do not need the kit source: this recipe and the skeleton are enough.
2. Run `npx qa skeleton --design <design.md> --issue <issue.md> --feature "<title>" --config <import path of qa.config.ts from qa/> --out qa/<slug>.spec.ts`. From `qa/`, the import path is normally `../qa.config.ts`. Never write the skeleton by hand. The command refuses an `--out` file that exists.
3. Write `qa/<slug>.scenarios.md` from `templates/scenarios.md`. Name one seed record for each state. When no seed record reaches a state, add it to the seed data with fake values, and say so.
4. In each `test.fixme`: sign in, reach the state from its scenario, and assert each expected value from the "What the person sees" cell and the seed record. Tag `criteria` with the `AC` ids each test proves. Keep `test.fixme` on a test whose route does not exist yet.
5. Planning does not need a run, and a run can be impossible before the build. After the build runs the spec, run `npx qa coverage --design … --issue …`. Each `AC` id needs a test.

## Rules

- Never assert a value that neither the spec nor the seed gives. Ask the owner, in the final reply, for a missing value.
- Never change `design.md`.
- One `qa.step` per state, with the state id exactly as the skeleton wrote it.

## The reply

List:

- the files written;
- the scenarios added to the seed;
- the states with no route yet;
- the questions for the owner.

## Red flags

- An expected value copied from the running app.
- A state with no named scenario.
- A removed `test.fixme` on a route that does not exist.
- A plan file with another name or in another folder.
- A spec written before `qa skeleton` ran.
