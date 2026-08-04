import type { ExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'

import type { WorktreeLineage, WorkspaceLineage } from './types'

export type ListDesktopLineageForHostArgs = { executionHostId: typeof LOCAL_EXECUTION_HOST_ID }

export type HostLineageSnapshot =
  | {
      authoritative: true
      authority: { kind: 'local'; executionHostId: typeof LOCAL_EXECUTION_HOST_ID }
      worktreeLineageById: Record<string, WorktreeLineage>
      workspaceLineageByChildKey: Record<string, WorkspaceLineage>
    }
  | {
      authoritative: false
      executionHostId: ExecutionHostId
      reason: 'ambiguous-owner' | 'authority-unknown' | 'stale' | 'unavailable' | 'rejected'
    }
