import { parseWorkspaceKey } from '~shared/workspace/scope'

import { resumeSleepingAgentSessionsForWorktree } from '../components/terminal-workspace/resume-sleeping-agent-session'
import {
  activateWebRuntimeSessionWorktree,
  isWebRuntimeSessionActive
} from '../runtime/web-runtime-session'
import { useAppStore } from '../store'
import { setWorktreeNavActivator } from '../store/slices/worktree-nav-history'
import { activateAndRevealFolderWorkspace } from './folder-workspace-activation'
import { ensureWebRuntimeWorktreeTerminalAfterWake } from './web-runtime-worktree-wake'
import type { ActivateAndRevealResult, ActivateWorktreeOptions } from './worktree-activation-types'
import { buildCreatedAgentReopenStartup } from './worktree-created-agent-startup'
import { ensureWorktreeHasInitialTerminal } from './worktree-initial-terminal'
import { getRuntimeEnvironmentIdForWorktree } from './worktree-runtime-owner'

export type { AgentStartedTelemetry } from './agent-started-telemetry'
export { activateAndRevealFolderWorkspace } from './folder-workspace-activation'
export { ensureWebRuntimeWorktreeTerminalAfterWake } from './web-runtime-worktree-wake'
export { ensureWorktreeHasInitialTerminal } from './worktree-initial-terminal'
export type { ActivateAndRevealResult, WorktreeStartupPayload } from './worktree-activation-types'

export function activateAndRevealWorktree(
  worktreeId: string,
  options?: ActivateWorktreeOptions
): ActivateAndRevealResult | false {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (!worktree) {
    return false
  }
  // Why: a local selection wins even when the same worktree remained mounted
  // behind an active remote Coworking surface.
  state.setActiveCoworkingWorkspaceRoute(null)
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
  notifyHostRuntimeOfWorktreeActivation(worktreeId, options?.notifyHostRuntime)
  // Why: focus recency lands synchronously with selection so later startup or
  // reveal failures cannot leave Cmd+J ordering behind what the user saw.
  if (!isPlainAlreadyActiveTerminal) {
    state.markWorktreeVisited(worktreeId)
    if (!state.isNavigatingHistory) {
      state.recordWorktreeVisit(worktreeId)
    }
  }
  resumeSleepingAgentSessionsForWorktree(worktreeId)
  const primaryTabId = ensureWorktreeHasInitialTerminal(
    useAppStore.getState(),
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
  worktreeId: string,
  notifyHostRuntime: boolean | undefined
): void {
  if (notifyHostRuntime === false) {
    return
  }
  const state = useAppStore.getState()
  const environmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
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
