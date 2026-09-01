import { splitWorktreeIdForFilesystem } from '@yiru/runtime-protocol/model/workspace'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'

import type { RuntimeClientTarget } from '../orpc-client'
import { getActiveRuntimeTarget } from '../rpc-client'
import { toRuntimeWorktreePathSelector, toRuntimeWorktreeSelector } from '../worktree-selector'

export type RuntimeGitSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> &
  Partial<
    Pick<
      GlobalSettings,
      'commitMessageAi' | 'sourceControlAi' | 'agentCmdOverrides' | 'enableGitHubAttribution'
    >
  >

export type RuntimeGitContext = {
  settings: RuntimeGitSettings | null | undefined
  worktreeId: string | null | undefined
  worktreePath: string
  connectionId?: string
}

function resolveWorktreePath(context: RuntimeGitContext): string {
  return context.worktreeId
    ? (splitWorktreeIdForFilesystem(context.worktreeId)?.worktreePath ?? context.worktreePath)
    : context.worktreePath
}

export function getRuntimeGitTarget(context: RuntimeGitContext): RuntimeClientTarget {
  return getActiveRuntimeTarget(context.settings)
}

export function getRuntimeGitWorktree(context: RuntimeGitContext): string {
  return context.worktreeId
    ? toRuntimeWorktreeSelector(context.worktreeId)
    : toRuntimeWorktreePathSelector(resolveWorktreePath(context))
}

export function getRuntimeGitScope(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  connectionId: string | null | undefined
): string | null | undefined {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment' ? `runtime:${target.environmentId}` : connectionId
}
