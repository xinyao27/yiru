import { getWorkspaceSourceName } from '../../../desktop/src/shared/new-workspace/workspace-source'
import type {
  CreateSparseCheckoutRequest,
  GitPushTarget,
  SetupDecision,
  TuiAgent
} from '../../../desktop/src/shared/types'
import { resolveMobileWorkspaceCreateName } from './mobile-workspace-name'
import type { WorkspaceAgentChoice } from './workspace-agent-selection'

export type WorkspaceCreateSetupDecision = SetupDecision
export type WorkspaceCreateSparseCheckout = CreateSparseCheckoutRequest
export type WorkspaceCreateGitPushTarget = GitPushTarget

export type WorkspaceCreateHostedStartPoint = {
  baseBranch: string
  pushTarget?: WorkspaceCreateGitPushTarget
}

export type WorkspaceCreateReviewItem =
  | {
      provider: 'github'
      source: { type: 'pr'; repoId: string; number: number; title: string; url: string }
    }
  | {
      provider: 'gitlab'
      source: { type: 'mr'; repoId: string; number: number; title: string; url: string }
    }

export type WorkspaceCreateParams = Record<string, unknown>

export function buildReviewWorkspaceCreateParams(args: {
  item: WorkspaceCreateReviewItem
  setupDecision: WorkspaceCreateSetupDecision
  agent?: WorkspaceAgentChoice
  workspaceName?: string
  note?: string
  baseBranch?: string
  compareBaseRef?: string
  branchNameOverride?: string
  pushTarget?: WorkspaceCreateGitPushTarget
  sparseCheckout?: WorkspaceCreateSparseCheckout
  hostedStartPoint?: WorkspaceCreateHostedStartPoint
  nameIsAutoManaged?: boolean
}): WorkspaceCreateParams {
  const {
    item,
    setupDecision,
    agent,
    workspaceName,
    note,
    baseBranch,
    compareBaseRef,
    branchNameOverride,
    pushTarget,
    sparseCheckout,
    hostedStartPoint,
    nameIsAutoManaged = true
  } = args
  const shouldLaunchAgent = agent !== 'blank'
  const createdWithAgent = shouldLaunchAgent ? (agent as TuiAgent) : undefined
  const comment = note?.trim()
  const selectedBaseBranch = baseBranch || hostedStartPoint?.baseBranch
  const selectedPushTarget = pushTarget ?? hostedStartPoint?.pushTarget
  const sourceName = getWorkspaceSourceName({ provider: item.provider, ...item.source })
  return {
    repo: `id:${item.source.repoId}`,
    name: resolveMobileWorkspaceCreateName({
      draft: workspaceName,
      fallback: `${item.source.type}-${item.source.number}`
    }),
    ...(nameIsAutoManaged ? { displayName: sourceName.displayName } : {}),
    setupDecision,
    activate: true,
    ...(shouldLaunchAgent ? { startupDraft: item.source.url } : {}),
    ...(createdWithAgent ? { createdWithAgent } : {}),
    ...(selectedBaseBranch ? { baseBranch: selectedBaseBranch } : {}),
    ...(compareBaseRef ? { compareBaseRef } : {}),
    ...(branchNameOverride ? { branchNameOverride } : {}),
    ...(selectedPushTarget ? { pushTarget: selectedPushTarget } : {}),
    ...(sparseCheckout ? { sparseCheckout } : {}),
    ...(comment ? { comment } : {}),
    ...(item.provider === 'github'
      ? { linkedPR: item.source.number }
      : { linkedGitLabMR: item.source.number })
  }
}
