import type { DirectSshAuthority } from '@yiru/runtime-protocol/ssh-connection'
import type { AppState } from '~renderer/store/types'

import { resolveDirectSshTargetScope } from '../target-scope/scope'

export function directSshHostHydrationScope(
  state: AppState,
  authority: DirectSshAuthority,
  catalogRevision: number
) {
  return resolveDirectSshTargetScope({
    targetId: authority.targetId,
    catalogRevision,
    repos: state.repos,
    worktreesByRepo: state.worktreesByRepo,
    detectedWorktreesByRepo: state.detectedWorktreesByRepo,
    folderWorkspaces: state.folderWorkspaces,
    projectGroups: state.projectGroups,
    restoredRuntimeHostIdByWorkspaceSessionKey: state.restoredRuntimeHostIdByWorkspaceSessionKey
  })
}
