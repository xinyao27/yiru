import { useState } from 'react'

import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import type {
  MobileCommitFailureRecovery,
  RecordMobileCommitFailure
} from './commit-failure-recovery'
import { useMobileCommitFailureRecovery } from './use-commit-failure-recovery'

type Params = {
  client: RpcClient | null
  connState: ConnectionState
  worktreeId: string
}

export function useMobileSourceControlCommitFailure({ client, connState, worktreeId }: Params): {
  commitFailureRecovery: MobileCommitFailureRecovery | null
  commitFailureRecoveryAction: ReturnType<typeof useMobileCommitFailureRecovery>
  recordCommitFailure: RecordMobileCommitFailure
} {
  const [commitFailureRecovery, recordCommitFailure] = useState<MobileCommitFailureRecovery | null>(
    null
  )
  const commitFailureRecoveryAction = useMobileCommitFailureRecovery({
    client,
    connState,
    worktreeId,
    failure: commitFailureRecovery
  })
  return { commitFailureRecovery, commitFailureRecoveryAction, recordCommitFailure }
}
