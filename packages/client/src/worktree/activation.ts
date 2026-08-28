import type { Worktree } from '@yiru/runtime-protocol/workbench/types'
import { parseWorkspaceKey } from '@yiru/runtime-protocol/workbench/workspace/scope'

import { readProjectCatalogRuntimeState } from '../project-catalog/runtime-state'
import {
  activateWebRuntimeSessionWorktree,
  isWebRuntimeSessionActive
} from '../runtime/web-runtime-session'
import { useAppStore } from '../store/state'
import { resumeSleepingAgentSessionsForWorktree } from '../terminal-workspace/resume-sleeping-agent-session'
import { ensureWebRuntimeWorktreeTerminalAfterWake } from '../web/runtime-worktree-wake'
import { activateAndRevealFolderWorkspace } from '../workspace/activation'
import type { ActivateAndRevealResult, ActivateWorktreeOptions } from './activation-types'
import { buildCreatedAgentReopenStartup } from './agent-startup'
import { ensureWorktreeHasInitialTerminal } from './initial-terminal'
import { getRuntimeEnvironmentIdForWorktree } from './runtime-owner'
import { setWorktreeNavActivator } from './state/nav-history'

export type { AgentStartedTelemetry } from '../agent/started-telemetry'
export { activateAndRevealFolderWorkspace } from '../workspace/activation'
export { ensureWebRuntimeWorktreeTerminalAfterWake } from '../web/runtime-worktree-wake'
export { ensureWorktreeHasInitialTerminal } from './initial-terminal'
export type { ActivateAndRevealResult, WorktreeStartupPayload } from './activation-types'

export function activateAndRevealWorktree(
  worktreeId: string,
  options?: ActivateWorktreeOptions
): ActivateAndRevealResult | false {
  const runtimeState = readProjectCatalogRuntimeState()
  const worktree = Object.values(runtimeState.worktreesByRepo)
    .flat()
    .find((candidate) => candidate.id === worktreeId)
  return worktree ? activateAndRevealKnownWorktree(worktree, options) : false
}

export function activateAndRevealKnownWorktree(
  worktree: Worktree,
  options?: ActivateWorktreeOptions
): ActivateAndRevealResult {
  const state = useAppStore.getState()
  const worktreeId = worktree.id
  const catalogRuntimeState = readProjectCatalogRuntimeState()
  const ownerWorktrees = catalogRuntimeState.worktreesByRepo[worktree.repoId] ?? []
  const runtimeState = {
    ...catalogRuntimeState,
    worktreesByRepo: {
      ...catalogRuntimeState.worktreesByRepo,
      [worktree.repoId]: ownerWorktrees.some((candidate) => candidate.id === worktree.id)
        ? ownerWorktrees
        : [...ownerWorktrees, worktree]
    }
  }
  const hasActivationWork = Boolean(options?.startup || options?.setup || options?.defaultTabs)
  const isPlainAlreadyActiveTerminal =
    !hasActivationWork &&
    state.activeRepoId === worktree.repoId &&
    state.activeWorktreeId === worktreeId &&
    state.activeView === 'terminal'
  if (worktree.repoId !== state.activeRepoId) {
    state.setActiveRepo(worktree.repoId)
  }
  if (state.activeView !== 'terminal') {
    state.setActiveView('terminal')
  }
  state.setActiveWorktree(worktreeId)
  notifyHostRuntimeOfWorktreeActivation(runtimeState, worktreeId, options?.notifyHostRuntime)
  // Why: focus recency lands synchronously with selection so later startup or
  // reveal failures cannot leave Command Palette ordering behind what the user saw.
  if (!isPlainAlreadyActiveTerminal) {
    state.markWorktreeVisited(worktreeId)
    if (!state.isNavigatingHistory) {
      state.recordWorktreeVisit(worktreeId)
    }
  }
  resumeSleepingAgentSessionsForWorktree(worktreeId)
  const primaryTabId = ensureWorktreeHasInitialTerminal(
    { ...useAppStore.getState(), ...runtimeState },
    worktreeId,
    options?.startup ?? buildCreatedAgentReopenStartup(worktree),
    options?.setup,
    options?.defaultTabs
  )
  if (primaryTabId && options?.initialCwd) {
    useAppStore.getState().queueTabInitialCwd(primaryTabId, options.initialCwd)
  }
  revealActivatedWorktree(worktreeId, worktree.repoId, options)
  if (options?.notifyHostRuntime !== false) {
    ensureWebRuntimeWorktreeTerminalAfterWake(worktreeId)
  }
  return { primaryTabId }
}

function notifyHostRuntimeOfWorktreeActivation(
  runtimeState: ReturnType<typeof readProjectCatalogRuntimeState>,
  worktreeId: string,
  notifyHostRuntime: boolean | undefined
): void {
  if (notifyHostRuntime === false) {
    return
  }
  const environmentId = getRuntimeEnvironmentIdForWorktree(runtimeState, worktreeId)
  if (!isWebRuntimeSessionActive(environmentId)) {
    return
  }
  void activateWebRuntimeSessionWorktree({
    worktreeId,
    environmentId,
    notifyDesktop: (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ !== true
  })
}

function revealActivatedWorktree(
  worktreeId: string,
  repoId: string,
  options: ActivateWorktreeOptions | undefined
): void {
  const state = useAppStore.getState()
  // Why: a hidden card cannot receive the pending sidebar reveal.
  if (state.filterRepoIds.length > 0 && !state.filterRepoIds.includes(repoId)) {
    state.setFilterRepoIds([])
  }
  if (options?.revealInSidebar === false) {
    return
  }
  const revealOptions = options?.sidebarRevealBehavior
    ? { behavior: options.sidebarRevealBehavior }
    : undefined
  state.revealWorktreeInSidebar(worktreeId, revealOptions)
}

// Why: nav history imports the store, so registration avoids a static cycle
// while keeping replay on the same activation paths as direct navigation.
setWorktreeNavActivator((workspaceId) => {
  const scope = parseWorkspaceKey(workspaceId)
  return scope?.type === 'folder'
    ? activateAndRevealFolderWorkspace(scope.folderWorkspaceId)
    : activateAndRevealWorktree(workspaceId)
})
