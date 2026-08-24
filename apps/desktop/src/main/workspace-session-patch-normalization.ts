import type { WorkspaceSessionPatch, WorkspaceSessionState } from '~shared/types'

const WORKSPACE_SESSION_PATCH_FULL_NORMALIZATION_KEYS = new Set<keyof WorkspaceSessionState>([
  'tabsByWorktree',
  'terminalLayoutsByTabId'
])

export function workspaceSessionPatchNeedsFullNormalization(patch: WorkspaceSessionPatch): boolean {
  return Object.keys(patch).some((key) =>
    WORKSPACE_SESSION_PATCH_FULL_NORMALIZATION_KEYS.has(key as keyof WorkspaceSessionState)
  )
}
