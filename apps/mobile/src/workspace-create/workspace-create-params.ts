import { WORKSPACE_CREATE_STARTUP_AGENT_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/capabilities'
import type { TuiAgent } from '@yiru/workbench-model/agent'
import { getWorkspaceSourceName } from '@yiru/workbench-model/workspace'
import type {
  CreateSparseCheckoutRequest,
  GitPushTarget,
  SetupDecision
} from '@yiru/workbench-model/workspace'

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

export function buildMobileWorkspaceAgentLaunchFields(args: {
  agentId: TuiAgent | undefined
  startupCommand: string | undefined
  hostCapabilities: readonly string[] | undefined
}): {
  startupAgent?: TuiAgent
  startupCommand?: string
  createdWithAgent?: TuiAgent
} {
  if (!args.agentId) {
    return {}
  }
  if (args.hostCapabilities?.includes(WORKSPACE_CREATE_STARTUP_AGENT_RUNTIME_CAPABILITY)) {
    return { startupAgent: args.agentId, createdWithAgent: args.agentId }
  }
  // Why: while capability support is unknown, send both forms. New hosts prefer
  // startupAgent; old hosts strip that unknown field and retain startupCommand.
  return {
    ...(args.hostCapabilities === undefined ? { startupAgent: args.agentId } : {}),
    ...(args.startupCommand ? { startupCommand: args.startupCommand } : {}),
    createdWithAgent: args.agentId
  }
}

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
