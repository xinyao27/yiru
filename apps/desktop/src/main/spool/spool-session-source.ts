import type { AiVaultSession } from '@yiru/workbench-model/agent'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { RuntimeMobileSessionTabsResult } from '../../shared/runtime-types'
import type {
  SpoolLiveSessionIdentity,
  SpoolLiveSessionProvider
} from './spool-live-session-display-identity'
import type { SpoolOwnerWorktree, SpoolRegisteredWorktreeRoot } from './spool-worktree-incarnation'

export type SpoolSessionProvider = SpoolLiveSessionProvider

export type SpoolSessionWorktreeIdentity = {
  worktreeId: string
  instanceId: string
  spoolIncarnationId: string
  actualHostScope: string
  target: SpoolOwnerWorktree
}

export type SpoolLiveSessionCandidate = {
  /** Owner-minted live identity stays stable while provider metadata catches up. */
  sessionKey?: string | null
  terminalHandle: string
  executionHostId: ExecutionHostId
  actualHostScope: string
  worktreeInstanceId: string
  spoolIncarnationId: string
  title: string
} & SpoolLiveSessionIdentity

export type SpoolSessionClientTab = RuntimeMobileSessionTabsResult['tabs'][number] & {
  spoolSessionKey?: string | null
  spoolLiveSessionIdentity?: SpoolLiveSessionIdentity
}

export type SpoolMobileSessionTabsResult = Omit<RuntimeMobileSessionTabsResult, 'tabs'> & {
  tabs: SpoolSessionClientTab[]
}

export type SpoolHistoricalSessionCandidate = {
  sessionKey?: string | null
  ownerRecordKey: string
  ownerRecord: SpoolOwnerHistoricalSessionRecord
  executionHostId: ExecutionHostId
  actualHostScope: string
  provider: 'claude' | 'codex'
  providerSessionId: string
  title: string
  attestationCwd: string | null
}

/** Owner-only because paths and commands must never cross the Spool wire boundary. */
export type SpoolOwnerHistoricalSessionRecord = {
  ownerRecordKey: string
  executionHostId: ExecutionHostId
  actualHostScope: string
  worktreeInstanceId: string
  spoolIncarnationId: string
  provider: 'claude' | 'codex'
  providerSessionId: string
  title: string
  transcriptPath: string
  resumeCommand: string
}

export type SpoolHistoricalSessionPurpose = 'catalog' | 'legacy-attestation'

export type SpoolHistoricalSessionPage = {
  sessions: readonly SpoolHistoricalSessionCandidate[]
  nextCursor: string | null
  scannedAt: string
}

export type SpoolAiVaultSessionPage = {
  sessions: readonly AiVaultSession[]
  nextCursor: string | null
  scannedAt: string
}

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
  prepare(args: {
    actualHostScope: string
    inventoryTarget: SpoolOwnerWorktree
    registeredRoots: readonly SpoolRegisteredWorktreeRoot[]
    binding: 'legacy-cwd-attribution' | 'proven-target-consistency'
  }): SpoolPreparedSessionRootMatcher
}

export type SpoolPreparedSessionRootMatcher = {
  matchMostSpecificRoots(
    cwds: readonly string[],
    signal?: AbortSignal
  ): Promise<readonly SpoolSessionRootMatch[]>
}

export type SpoolHistoricalSessionConsistency = {
  open(
    worktree: SpoolSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<SpoolPreparedHistoricalSessionConsistency>
}

export type SpoolPreparedHistoricalSessionConsistency = {
  retainConsistent(
    candidates: readonly SpoolHistoricalSessionCandidate[],
    signal?: AbortSignal
  ): Promise<readonly SpoolHistoricalSessionCandidate[]>
}

export type SpoolSessionSource = {
  listLiveSessions(
    worktree: SpoolSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<readonly SpoolLiveSessionCandidate[]>
  listHistoricalSessionPage(
    worktree: SpoolSessionWorktreeIdentity,
    purpose: SpoolHistoricalSessionPurpose,
    cursor: string | null,
    inventoryScope: string,
    signal?: AbortSignal
  ): Promise<SpoolHistoricalSessionPage>
  releaseHistoricalSessionPage(
    worktree: SpoolSessionWorktreeIdentity,
    purpose: SpoolHistoricalSessionPurpose,
    cursor: string | null,
    inventoryScope: string
  ): Promise<void>
  retainOwnerHistoricalRecord(record: SpoolOwnerHistoricalSessionRecord): boolean
  resolveOwnerHistoricalRecord(ownerRecordKey: string): SpoolOwnerHistoricalSessionRecord | null
  subscribe?: (listener: () => void) => () => void
}

export type SpoolExecutionHostSessionReadRequest = {
  worktreeKind: SpoolOwnerWorktree['kind']
  executionHostId: ExecutionHostId
  worktreeId: string
  worktreeInstanceId: string
  spoolIncarnationId: string
  worktreePath: string
  localWslDistro: string | null
  purpose: SpoolHistoricalSessionPurpose
  inventoryScope: string
}

export type SpoolObservedProviderSession = {
  provider: 'claude' | 'codex'
  providerSessionId: string
  sessionKey: string | null
}

/** Composition routes this narrow reader to local, SSH, or paired-runtime execution. */
export type SpoolExecutionHostSessionReader = {
  registerPublicWorktree?(request: SpoolExecutionHostSessionReadRequest): void
  unregisterPublicWorktree?(request: SpoolExecutionHostSessionReadRequest): void
  listMobileSessionTabs(
    request: SpoolExecutionHostSessionReadRequest,
    signal?: AbortSignal
  ): Promise<SpoolMobileSessionTabsResult | null>
  listAiVaultSessionPage(
    request: SpoolExecutionHostSessionReadRequest,
    cursor: string | null,
    signal?: AbortSignal
  ): Promise<SpoolAiVaultSessionPage>
  releaseAiVaultSessionPage(
    request: SpoolExecutionHostSessionReadRequest,
    cursor: string | null
  ): Promise<void>
  subscribe?: (
    listener: (
      snapshot?: SpoolMobileSessionTabsResult,
      request?: SpoolExecutionHostSessionReadRequest,
      providerSessions?: readonly SpoolObservedProviderSession[]
    ) => void
  ) => () => void
}
