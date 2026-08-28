import type { UIRuntimeState } from './slice-runtime-state'
import type { UIShellState } from './slice-shell-state'
import type { UIWorkspaceState } from './slice-workspace-state'

export type UISlice = UIShellState & UIWorkspaceState & UIRuntimeState
