import { toast } from 'sonner'
import { folderWorkspaceKey } from '~shared/workspace/scope'

import {
  folderWorkspaceActivationBlocked,
  getFolderWorkspacePathStatusDescription,
  getFolderWorkspacePathStatusTitle
} from '../components/sidebar/folder-workspace-path-status'
import { resumeSleepingAgentSessionsForWorktree } from '../components/terminal-workspace/resume-sleeping-agent-session'
import { useAppStore } from '../store'
import type { PendingSidebarWorktreeReveal } from '../store/slices/ui'
import type { ActivateAndRevealResult, WorktreeStartupPayload } from './worktree-activation-types'
import { ensureWorktreeHasInitialTerminal } from './worktree-initial-terminal'
import { getRuntimeEnvironmentIdForWorktree } from './worktree-runtime-owner'

export function activateAndRevealFolderWorkspace(
  folderWorkspaceId: string,
  options?: {
    sidebarRevealBehavior?: PendingSidebarWorktreeReveal['behavior']
    startup?: WorktreeStartupPayload
    runtimeEnvironmentId?: string | null
  }
): ActivateAndRevealResult | false {
  const state = useAppStore.getState()
  const folderWorkspace = state.folderWorkspaces.find(
    (workspace) => workspace.id === folderWorkspaceId
  )
  if (!folderWorkspace) {
    return false
  }
  const workspaceKey = folderWorkspaceKey(folderWorkspaceId)
  const runtimeEnvironmentId =
    options && 'runtimeEnvironmentId' in options
      ? (options.runtimeEnvironmentId ?? null)
      : getRuntimeEnvironmentIdForWorktree(state, workspaceKey)
  const pathStatus = state.getFreshFolderWorkspacePathStatus(
    { scope: 'folder-workspace', folderWorkspaceId },
    { runtimeEnvironmentId }
  )
  if (folderWorkspaceActivationBlocked(pathStatus)) {
    toast.error(getFolderWorkspacePathStatusTitle(pathStatus) ?? 'Cannot open folder workspace', {
      description: getFolderWorkspacePathStatusDescription(pathStatus) ?? folderWorkspace.folderPath
    })
    return false
  }
  // Why: explicit local activation leaves the independent opaque Coworking route namespace.
  state.setActiveCoworkingWorkspaceRoute(null)
  if (state.activeView !== 'terminal') {
    state.setActiveView('terminal')
  }
  state.setActiveFolderWorkspace(folderWorkspaceId)
  state.markWorktreeVisited(workspaceKey)
  if (!state.isNavigatingHistory) {
    state.recordWorktreeVisit(workspaceKey)
  }
  resumeSleepingAgentSessionsForWorktree(workspaceKey)
  const primaryTabId = ensureWorktreeHasInitialTerminal(
    useAppStore.getState(),
    workspaceKey,
    options?.startup
  )
  const revealOptions = options?.sidebarRevealBehavior
    ? { behavior: options.sidebarRevealBehavior }
    : undefined
  state.revealWorktreeInSidebar(workspaceKey, revealOptions)
  return { primaryTabId }
}
