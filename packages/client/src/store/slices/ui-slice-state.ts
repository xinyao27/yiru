import type { UIRuntimeState } from './ui-slice-runtime-state'
import type { UIShellState } from './ui-slice-shell-state'
import type { UIWorkspaceState } from './ui-slice-workspace-state'

export type UISlice = UIShellState & UIWorkspaceState & UIRuntimeState
