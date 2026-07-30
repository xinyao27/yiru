import type { DirectSshAuthority } from '@yiru/runtime-protocol/ssh-connection'
import type { ExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'

import type { SshExecutionHostId } from './detected-worktree-provider-contract'
import type { Repo } from './types'

export type ListReposForExecutionHostArgs =
  | { executionHostId: typeof LOCAL_EXECUTION_HOST_ID }
  | {
      executionHostId: SshExecutionHostId
      expectedAuthority: DirectSshAuthority
    }

export type HostRepoCatalogSnapshot =
  | {
      authoritative: true
      authority:
        | { kind: 'local'; executionHostId: typeof LOCAL_EXECUTION_HOST_ID }
        | ({
            kind: 'direct-ssh'
            executionHostId: SshExecutionHostId
          } & DirectSshAuthority)
      repos: readonly Repo[]
    }
  | {
      authoritative: false
      executionHostId: ExecutionHostId
      reason: 'authority-unknown' | 'stale' | 'unavailable' | 'rejected'
    }
