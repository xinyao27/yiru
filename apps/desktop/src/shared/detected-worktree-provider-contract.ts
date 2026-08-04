import type { ExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'

import type { DetectedWorktreeListResult } from './types'

export const PROVIDER_REQUEST_ID_MAX_UTF8_BYTES = 128
export type ProviderRequestId = string & { readonly __providerRequestId: unique symbol }

export type LocalDetectedWorktreeRequest = {
  providerRequestId: ProviderRequestId
  repoId: string
  executionHostId: typeof LOCAL_EXECUTION_HOST_ID
}

export type ListDetectedWorktreesArgs = LocalDetectedWorktreeRequest

export type AuthoritativeDetectedWorktreeHost = {
  kind: 'local'
  executionHostId: typeof LOCAL_EXECUTION_HOST_ID
}

export type HostQualifiedDetectedWorktreeResult =
  | {
      status: 'complete' | 'non-authoritative'
      providerRequestId: ProviderRequestId
      repoId: string
      authority: AuthoritativeDetectedWorktreeHost
      result: DetectedWorktreeListResult
    }
  | {
      providerRequestId: ProviderRequestId
      executionHostId: ExecutionHostId
      status:
        | 'canceled'
        | 'timed-out'
        | 'stale'
        | 'ambiguous-owner'
        | 'authority-unknown'
        | 'rejected'
    }

export type LegacyDetectedWorktreeRequest = { repoId: string }
