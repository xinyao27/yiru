import type { AiVaultSession } from '@yiru/workbench-model/agent'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import type { RuntimeMobileSessionTabsResult } from '../../shared/runtime-types'
import type {
  CoworkingLiveSessionIdentity,
  CoworkingLiveSessionProvider
} from './live-session-display-identity'
import type {
  CoworkingOwnerWorktree,
  CoworkingRegisteredWorktreeRoot
} from './worktree-incarnation'

export type CoworkingSessionProvider = CoworkingLiveSessionProvider

export type CoworkingSessionWorktreeIdentity = {
  worktreeId: string
  instanceId: string
  coworkingIncarnationId: string
  actualHostScope: string
  target: CoworkingOwnerWorktree
}

export type CoworkingLiveSessionCandidate = {
  /** Owner-minted live identity stays stable while provider metadata catches up. */
  sessionKey?: string | null
  terminalHandle: string
  executionHostId: ExecutionHostId
  actualHostScope: string
  worktreeInstanceId: string
  coworkingIncarnationId: string
  title: string
} & CoworkingLiveSessionIdentity

export type CoworkingSessionClientTab = RuntimeMobileSessionTabsResult['tabs'][number] & {
  coworkingSessionKey?: string | null
  coworkingLiveSessionIdentity?: CoworkingLiveSessionIdentity
}

export type CoworkingMobileSessionTabsResult = Omit<RuntimeMobileSessionTabsResult, 'tabs'> & {
  tabs: CoworkingSessionClientTab[]
}

export type CoworkingHistoricalSessionCandidate = {
  sessionKey?: string | null
  ownerRecordKey: string
  ownerRecord: CoworkingOwnerHistoricalSessionRecord
  executionHostId: ExecutionHostId
  actualHostScope: string
  provider: 'claude' | 'codex'
  providerSessionId: string
  title: string
  attestationCwd: string | null
}

/** Owner-only because paths and commands must never cross the Coworking wire boundary. */
export type CoworkingOwnerHistoricalSessionRecord = {
  ownerRecordKey: string
  executionHostId: ExecutionHostId
  actualHostScope: string
  worktreeInstanceId: string
  coworkingIncarnationId: string
  provider: 'claude' | 'codex'
  providerSessionId: string
  title: string
  transcriptPath: string
  resumeCommand: string
}

export type CoworkingHistoricalSessionPurpose = 'catalog' | 'legacy-attestation'

export type CoworkingHistoricalSessionPage = {
  sessions: readonly CoworkingHistoricalSessionCandidate[]
  nextCursor: string | null
  scannedAt: string
}

export type CoworkingAiVaultSessionPage = {
  sessions: readonly AiVaultSession[]
  nextCursor: string | null
  scannedAt: string
}

export type CoworkingSessionRootMatch =
  | {
      status: 'matched'
      worktreeId: string
      instanceId: string
    }
  | {
      status: 'ambiguous' | 'unavailable' | 'unmatched'
    }

/** Host adapters own canonical path, separator, and case-sensitivity rules. */
export type CoworkingSessionRootMatcher = {
  prepare(args: {
    actualHostScope: string
    inventoryTarget: CoworkingOwnerWorktree
    registeredRoots: readonly CoworkingRegisteredWorktreeRoot[]
    binding: 'legacy-cwd-attribution' | 'proven-target-consistency'
  }): CoworkingPreparedSessionRootMatcher
}

export type CoworkingPreparedSessionRootMatcher = {
  matchMostSpecificRoots(
    cwds: readonly string[],
    signal?: AbortSignal
  ): Promise<readonly CoworkingSessionRootMatch[]>
}

export type CoworkingHistoricalSessionConsistency = {
  open(
    worktree: CoworkingSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<CoworkingPreparedHistoricalSessionConsistency>
}

export type CoworkingPreparedHistoricalSessionConsistency = {
  retainConsistent(
    candidates: readonly CoworkingHistoricalSessionCandidate[],
    signal?: AbortSignal
  ): Promise<readonly CoworkingHistoricalSessionCandidate[]>
}

export type CoworkingSessionSource = {
  listLiveSessions(
    worktree: CoworkingSessionWorktreeIdentity,
    signal?: AbortSignal
  ): Promise<readonly CoworkingLiveSessionCandidate[]>
  listHistoricalSessionPage(
    worktree: CoworkingSessionWorktreeIdentity,
    purpose: CoworkingHistoricalSessionPurpose,
    cursor: string | null,
    inventoryScope: string,
    signal?: AbortSignal
  ): Promise<CoworkingHistoricalSessionPage>
  releaseHistoricalSessionPage(
    worktree: CoworkingSessionWorktreeIdentity,
    purpose: CoworkingHistoricalSessionPurpose,
    cursor: string | null,
    inventoryScope: string
  ): Promise<void>
  retainOwnerHistoricalRecord(record: CoworkingOwnerHistoricalSessionRecord): boolean
  resolveOwnerHistoricalRecord(ownerRecordKey: string): CoworkingOwnerHistoricalSessionRecord | null
  subscribe?: (listener: () => void) => () => void
}

export type CoworkingExecutionHostSessionReadRequest = {
  worktreeKind: CoworkingOwnerWorktree['kind']
  executionHostId: ExecutionHostId
  worktreeId: string
  worktreeInstanceId: string
  coworkingIncarnationId: string
  worktreePath: string
  localWslDistro: string | null
  purpose: CoworkingHistoricalSessionPurpose
  inventoryScope: string
}

export type CoworkingObservedProviderSession = {
  provider: 'claude' | 'codex'
  providerSessionId: string
  sessionKey: string | null
}

/** Composition routes this narrow reader to local, SSH, or paired-runtime execution. */
export type CoworkingExecutionHostSessionReader = {
  registerPublicWorktree?(request: CoworkingExecutionHostSessionReadRequest): void
  unregisterPublicWorktree?(request: CoworkingExecutionHostSessionReadRequest): void
  listMobileSessionTabs(
    request: CoworkingExecutionHostSessionReadRequest,
    signal?: AbortSignal
  ): Promise<CoworkingMobileSessionTabsResult | null>
  listAiVaultSessionPage(
    request: CoworkingExecutionHostSessionReadRequest,
    cursor: string | null,
    signal?: AbortSignal
  ): Promise<CoworkingAiVaultSessionPage>
  releaseAiVaultSessionPage(
    request: CoworkingExecutionHostSessionReadRequest,
    cursor: string | null
  ): Promise<void>
  subscribe?: (
    listener: (
      snapshot?: CoworkingMobileSessionTabsResult,
      request?: CoworkingExecutionHostSessionReadRequest,
      providerSessions?: readonly CoworkingObservedProviderSession[]
    ) => void
  ) => () => void
}
