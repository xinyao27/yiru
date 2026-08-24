import {
  createWebRuntimeSessionTerminal,
  isWebRuntimeSessionActive,
  isWebTerminalSurfaceTabId
} from '../runtime/web-runtime-session'
import {
  beginWebRuntimeWakeTerminalRespawn,
  endWebRuntimeWakeTerminalRespawn
} from '../runtime/web-runtime-wake-terminal-respawn'
import { getLastKnownHostTerminalTabCount } from '../runtime/web-session-tabs-sync'
import { useAppStore } from '../store'
import { tabHasLivePty } from './tab-has-live-pty'
import { getRuntimeEnvironmentIdForWorktree } from './worktree-runtime-owner'

export function ensureWebRuntimeWorktreeTerminalAfterWake(worktreeId: string): void {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (!worktree) {
    return
  }
  const environmentId = getRuntimeEnvironmentIdForWorktree(state, worktree.id)
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return
  }
  const tabs = state.tabsByWorktree[worktreeId] ?? []
  if (tabs.some((tab) => tabHasLivePty(state.ptyIdsByTabId, tab.id))) {
    return
  }
  if (tabs.some((tab) => isWebTerminalSurfaceTabId(tab.id))) {
    // Why: host-owned mirrors should repopulate PTY handles rather than spawn duplicates.
    return
  }
  if (getLastKnownHostTerminalTabCount(environmentId, worktreeId) > 0) {
    return
  }
  if (tabs.length > 0 && state.reconcileWorktreeTabModel(worktreeId).renderableTabCount === 0) {
    return
  }
  if (!beginWebRuntimeWakeTerminalRespawn(worktreeId)) {
    return
  }
  // Why: sleeping retains rows but clears host PTYs; activation may otherwise
  // leave tab chrome with no focusable surface.
  void createWebRuntimeSessionTerminal({
    worktreeId,
    environmentId,
    activate: true,
    selectWorktree: false
  }).finally(() => {
    endWebRuntimeWakeTerminalRespawn(worktreeId)
  })
}
