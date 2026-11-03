export * from "./types.ts";
export { defineQaConfig, ANONYMOUS_ROLE } from "./config.ts";
export { finding, dedupe, hasFailures, selectorPattern, applyIgnore } from "./findings.ts";
export { INTERACTIVE_SELECTOR, ITEM_ROLES, WIDGET_ROLES, TEXT_ENTRY_TYPES } from "./interactive.ts";
export { collectElements, collectText, type ElementInfo } from "./collect.ts";
export { checkA11y, checkForcedColors, checkReflow } from "./checks/a11y.ts";
export { accessProbes, samePath, defaultIsDenied, checkAccess, type AccessProbe, type AccessOptions } from "./checks/access.ts";
export { conformanceRules, checkConformance, type ConformanceContext } from "./checks/conformance.ts";
export { copyRules, checkCopy, caseDrift, type CopyInput } from "./checks/copy.ts";
export { coverage, type CoverageInput } from "./checks/coverage.ts";
export { cursorRules, checkEscape, checkInteraction } from "./checks/interaction.ts";
export { layoutRules, checkLayout, type LayoutOptions } from "./checks/layout.ts";
export { findValues, maskSample, watchLeaks, type LeakWatch, type LeakOptions } from "./checks/leaks.ts";
export { watchSmoke, checkAction, checkStyled, checkDeclaredActions, type SmokeWatch } from "./checks/smoke.ts";
export { appendStep, readManifest, runDir, ensureQaRunId, defaultCacheDir, hasQaRunId, latestRunDir, type StepRecord, type RunManifest } from "./manifest.ts";
export { getVerdict, putVerdict, verdictKey, type Verdict } from "./cache.ts";
export { loadPlaywright } from "./playwright.ts";
export { createQaTest, type Qa, type StepOptions, type QaTestOptions } from "./fixture.ts";
export { runPageChecks, filterIgnored, PAGE_CHECKS, type PageCheckOptions } from "./run-checks.ts";
export { runPreflight } from "./preflight.ts";
export { reuseSignIn, forgetSignIn, type ReuseSignInOptions } from "./sign-in.ts";
export { timed, timingTable, type Timings, type TimingRow } from "./timing.ts";
export { compareRuns, type RunComparison, type CompareRow } from "./compare.ts";
export { QA_VIEWPORTS, qaProjects, type QaViewport, type QaBrowser, type QaExtra, type QaProfileOptions } from "./profiles.ts";
export { compareImages, diffRun, approveBaselines, defaultBaselineDir, VISUAL_TOLERANCE, type ImageDiff, type VisualResult } from "./visual.ts";
export {
  pendingJudgeTasks, recordVerdicts, validateVerdicts, JUDGES, DEFAULT_RUBRIC,
  type JudgeId, type JudgeInput, type JudgeInputStep, type JudgeIndexEntry, type VerdictRecord,
} from "./judges.ts";
export { loadReportData, ownerList, isBlocked, reportStatus, renderReport, writeReport, type ReportData, type ReportVerdict, type OwnerItem, type ReportStatus } from "./report.ts";
export { parseStates, parseCriteria, parseFlows, specSkeleton, type SpecState, type SpecItem } from "./spec.ts";
export { appendLedger, LEDGER_HEADER } from "./ledger.ts";
