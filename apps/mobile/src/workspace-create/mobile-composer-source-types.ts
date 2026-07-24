import type { SmartNameMode } from '@yiru/workbench-model/workspace'
import type {
  WorkspaceSourceLinkedItem,
  WorkspaceSourceSelection
} from '@yiru/workbench-model/workspace'

import type { WorkspaceCreateGitPushTarget } from './workspace-create-params'

export type { SmartNameMode }

export type ComposerBaseState = {
  baseBranch?: string
  compareBaseRef?: string
  pushTarget?: WorkspaceCreateGitPushTarget
  branchNameOverride?: string
}

export type MobileLinkedWorkItem = WorkspaceSourceLinkedItem
export type SmartNameSelection = WorkspaceSourceSelection
export type MrStateFilter = 'opened' | 'merged' | 'closed' | 'all'

export type MobileComposerCreateSelection =
  | {
      kind: 'work-item'
      item: MobileLinkedWorkItem
      baseBranch?: string
      compareBaseRef?: string
      pushTarget?: WorkspaceCreateGitPushTarget
      branchNameOverride?: string
    }
  | {
      kind: 'branch'
      baseBranch: string
      refName: string
      localBranchName: string
      reuse: boolean
      branchNameOverride?: string
    }
  | { kind: 'new-branch'; branchName: string }
