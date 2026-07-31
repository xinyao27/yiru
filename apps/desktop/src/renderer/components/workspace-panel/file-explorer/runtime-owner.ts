import { getSettingsForWorktreeRuntimeOwner } from '~renderer/lib/worktree-runtime-owner'
import { useAppStore } from '~renderer/store'
import type { GlobalSettings } from '~shared/types'

export function getRightSidebarWorktreeRuntimeSettings(
  worktreeId: string | null | undefined
): Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> {
  const store = useAppStore.getState()
  // Why: right-sidebar file/git actions operate on the selected workspace.
  // Route by that workspace owner so global focused-host changes cannot retarget them.
  return getSettingsForWorktreeRuntimeOwner(store, worktreeId)
}
