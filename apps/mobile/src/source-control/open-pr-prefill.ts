import type { RpcClient } from '../transport/rpc-client'
import type { MobileGitStatusResult } from './git-status'
import { resolveMobilePrPrefill, type MobilePrPrefill } from './pr-create'

// Resolves the create-PR prefill from a git status snapshot. Split from the
// runners hook to keep that file under the line limit.

export async function buildOpenPrPrefill(
  client: Pick<RpcClient, 'orpc'> | null,
  worktreeId: string,
  status: MobileGitStatusResult | null,
  branchLabel: string
): Promise<MobilePrPrefill> {
  if (!client) {
    return { provider: 'github', base: 'main', title: branchLabel, body: '' }
  }
  const gitReadiness = getMobilePrEligibilityReadiness(status)
  return resolveMobilePrPrefill(client, worktreeId, {
    branch: status?.branch,
    title: branchLabel,
    ...gitReadiness
  })
}

export function getMobilePrEligibilityReadiness(status: MobileGitStatusResult | null): {
  hasUncommittedChanges?: boolean
  hasUpstream?: boolean
  ahead?: number
  behind?: number
} {
  if (!status) {
    return {}
  }
  const up = status?.upstreamStatus
  const upstreamReadiness = up
    ? {
        hasUpstream: up.hasUpstream,
        ahead: up.ahead,
        behind: up.behind
      }
    : {}
  return {
    hasUncommittedChanges: (status.entries?.length ?? 0) > 0,
    ...upstreamReadiness
  }
}
