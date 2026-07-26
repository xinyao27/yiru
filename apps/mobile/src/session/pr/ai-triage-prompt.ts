import { buildResolvePullRequestConflictsPrompt } from '@yiru/workbench-model/review'
import { buildFixBrokenChecksPrompt, getBrokenChecks } from '@yiru/workbench-model/review'
import type { PRCheckDetail } from '@yiru/workbench-model/review'

// Pure prompt builders for the mobile PR sidebar's "Fix checks with AI" /
// "Resolve conflicts with AI" triage actions.

export { getBrokenChecks }

export function hasBrokenChecks(checks: PRCheckDetail[]): boolean {
  return getBrokenChecks(checks).length > 0
}

export function buildFixChecksPrompt(input: {
  prNumber: number
  prTitle: string
  prUrl: string
  checks: PRCheckDetail[]
}): string {
  return buildFixBrokenChecksPrompt({
    reviewNumber: input.prNumber,
    reviewTitle: input.prTitle,
    reviewUrl: input.prUrl,
    checks: input.checks
  })
}

export function buildResolveConflictsPrompt(input: {
  prNumber: number
  baseRef?: string | null
  files: string[]
}): string {
  return buildResolvePullRequestConflictsPrompt({
    reviewKind: 'PR',
    baseRef: input.baseRef ?? undefined,
    entries: input.files.map((path) => ({ path })),
    worktreePath: null
  })
}
