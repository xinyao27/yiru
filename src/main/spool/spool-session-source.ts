import type { AiVaultListResult } from '../../shared/ai-vault-types'
import type { ExecutionHostId } from '../../shared/execution-host'
import type { RuntimeMobileSessionTabsResult } from '../../shared/runtime-types'
import type { SpoolOwnerWorktree } from './spool-worktree-incarnation'

export type SpoolSessionProvider = 'claude' | 'codex' | 'other'

export type SpoolSessionWorktreeIdentity = {
  worktreeId: string
  instanceId: string
  spoolIncarnationId: string
  target: SpoolOwnerWorktree
}

export type SpoolLiveSessionCandidate = {
  terminalHandle: string
  executionHostId: ExecutionHostId
  worktreeInstanceId: string
  spoolIncarnationId: string
  provider: SpoolSessionProvider
  providerSessionId: string | null
  title: string
}

export type SpoolHistoricalSessionCandidate = {
  ownerRecordKey: string
  executionHostId: ExecutionHostId
  provider: 'claude' | 'codex'
  providerSessionId: string
  title: string
  attestationCwd: string | null
}

/** Owner-only because paths and commands must never cross the Spool wire boundary. */
export type SpoolOwnerHistoricalSessionRecord = {
  ownerRecordKey: string
  executionHostId: ExecutionHostId
  worktreeInstanceId: string
  spoolIncarnationId: string
  provider: 'claude' | 'codex'
  providerSessionId: string
  title: string
  transcriptPath: string
  resumeCommand: string
}

export type SpoolHistoricalSessionPurpose = 'catalog' | 'legacy-attestation'

export type SpoolSessionRootMatch =
  | {
      status: 'matched'
      worktreeId: string
      instanceId: string
    }
  | {
      status: 'ambiguous' | 'unavailable' | 'unmatched'
    }

/** Host adapters own canonical path, separator, and case-sensitivity rules. */
export type SpoolSessionRootMatcher = {
  matchMostSpecificRoot(args: {
    executionHostId: ExecutionHostId
    cwd: string
    registeredWorktrees: readonly SpoolOwnerWorktree[]
  }): Promise<SpoolSessionRootMatch>
}

export type SpoolHistoricalSessionConsistency = {
  retainConsistent(
    worktree: SpoolSessionWorktreeIdentity,
    candidates: readonly SpoolHistoricalSessionCandidate[]
  ): Promise<readonly SpoolHistoricalSessionCandidate[]>
}

export type SpoolSessionSource = {
  listLiveSessions(
    worktree: SpoolSessionWorktreeIdentity
  ): Promise<readonly SpoolLiveSessionCandidate[]>
  listHistoricalSessions(
    worktree: SpoolSessionWorktreeIdentity,
    purpose: SpoolHistoricalSessionPurpose
  ): Promise<readonly SpoolHistoricalSessionCandidate[]>
  resolveOwnerHistoricalRecord(ownerRecordKey: string): SpoolOwnerHistoricalSessionRecord | null
  subscribe?: (listener: () => void) => () => void
}

export type SpoolExecutionHostSessionReadRequest = {
  executionHostId: ExecutionHostId
  worktreeId: string
  worktreeInstanceId: string
  spoolIncarnationId: string
  worktreePath: string
  purpose: SpoolHistoricalSessionPurpose
}

/** Composition routes this narrow reader to local, SSH, or paired-runtime execution. */
export type SpoolExecutionHostSessionReader = {
  listMobileSessionTabs(
    request: SpoolExecutionHostSessionReadRequest
  ): Promise<RuntimeMobileSessionTabsResult | null>
  listAiVaultSessions(request: SpoolExecutionHostSessionReadRequest): Promise<AiVaultListResult>
  subscribe?: (listener: () => void) => () => void
}
