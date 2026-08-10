import type { RuntimeGitLocalBranches } from '@yiru/runtime-protocol/mobile-runtime-types'
import {
  resolveSourceControlSyncAfterPull,
  resolveSourceControlSyncStart
} from '@yiru/workbench-model/review'
import { useCallback, useMemo } from 'react'

import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc, isRuntimeOrpcErrorCode } from '~/transport/runtime-orpc-client'

import type { ConnectionState } from '../transport/types'
import {
  isMobileGitUnavailable,
  type MobileGitStatusResult,
  type MobileGitUpstreamStatus
} from './git-status'
import { markMobileSyncPushStageError, type MobileSourceControlWorkflowResult } from './operation'
import type { GitCommitResult } from './screen-state'

type Params = {
  client: RpcClient | null
  connState: ConnectionState
  worktreeId: string
}

export type MobileGitRequests = {
  status: () => Promise<MobileGitStatusResult>
  upstreamStatus: () => Promise<MobileGitUpstreamStatus>
  commit: (message: string) => Promise<GitCommitResult>
  fetch: () => Promise<unknown>
  push: (input?: { publish?: boolean; forceWithLease?: boolean }) => Promise<unknown>
  pull: () => Promise<unknown>
  fastForward: () => Promise<unknown>
  rebaseFromBase: (baseRef: string) => Promise<unknown>
  stage: (filePath: string) => Promise<unknown>
  unstage: (filePath: string) => Promise<unknown>
  discard: (filePath: string) => Promise<unknown>
  bulkStage: (filePaths: string[]) => Promise<unknown>
  bulkUnstage: (filePaths: string[]) => Promise<unknown>
  checkout: (branch: string) => Promise<unknown>
  localBranches: () => Promise<RuntimeGitLocalBranches>
  abortMerge: () => Promise<unknown>
  abortRebase: () => Promise<unknown>
}

export type MobileGitStep =
  | { kind: 'fetch' }
  | { kind: 'push'; input?: { publish?: boolean; forceWithLease?: boolean } }
  | { kind: 'pull' }
  | { kind: 'fastForward' }
  | { kind: 'rebaseFromBase'; baseRef: string }
  | { kind: 'stage'; filePath: string }
  | { kind: 'unstage'; filePath: string }
  | { kind: 'discard'; filePath: string }
  | { kind: 'bulkStage'; filePaths: string[] }
  | { kind: 'bulkUnstage'; filePaths: string[] }
  | { kind: 'checkout'; branch: string }
  | { kind: 'abortMerge' }
  | { kind: 'abortRebase' }

export function runMobileGitStep(
  requests: MobileGitRequests,
  step: MobileGitStep
): Promise<unknown> {
  switch (step.kind) {
    case 'fetch':
      return requests.fetch()
    case 'push':
      return requests.push(step.input)
    case 'pull':
      return requests.pull()
    case 'fastForward':
      return requests.fastForward()
    case 'rebaseFromBase':
      return requests.rebaseFromBase(step.baseRef)
    case 'stage':
      return requests.stage(step.filePath)
    case 'unstage':
      return requests.unstage(step.filePath)
    case 'discard':
      return requests.discard(step.filePath)
    case 'bulkStage':
      return requests.bulkStage(step.filePaths)
    case 'bulkUnstage':
      return requests.bulkUnstage(step.filePaths)
    case 'checkout':
      return requests.checkout(step.branch)
    case 'abortMerge':
      return requests.abortMerge()
    case 'abortRebase':
      return requests.abortRebase()
  }
}

export function useMobileGitRequests({ client, connState, worktreeId }: Params) {
  const requests = useMemo<MobileGitRequests>(() => {
    const connectedClient = (): RpcClient => {
      if (!client || connState !== 'connected') {
        throw new Error('Waiting for desktop...')
      }
      return client
    }
    const worktree = `id:${worktreeId}`
    return {
      status: () =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.status, { worktree }),
      upstreamStatus: () =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.upstreamStatus, { worktree }),
      commit: (message) =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.commit, { worktree, message }),
      fetch: () => callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.fetch, { worktree }),
      push: (input = {}) =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.push, { worktree, ...input }),
      pull: () => callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.pull, { worktree }),
      fastForward: () =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.fastForward, { worktree }),
      rebaseFromBase: (baseRef) =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.rebaseFromBase, {
          worktree,
          baseRef
        }),
      stage: (filePath) =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.stage, { worktree, filePath }),
      unstage: (filePath) =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.unstage, {
          worktree,
          filePath
        }),
      discard: (filePath) =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.discard, {
          worktree,
          filePath
        }),
      bulkStage: (filePaths) =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.bulkStage, {
          worktree,
          filePaths
        }),
      bulkUnstage: (filePaths) =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.bulkUnstage, {
          worktree,
          filePaths
        }),
      checkout: (branch) =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.checkout, { worktree, branch }),
      localBranches: () =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.localBranches, { worktree }),
      abortMerge: () =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.abortMerge, { worktree }),
      abortRebase: () =>
        callRuntimeOrpc(connectedClient(), (runtime) => runtime.git.abortRebase, { worktree })
    }
  }, [client, connState, worktreeId])

  const sendCommitRequest = useCallback(
    async (message: string): Promise<GitCommitResult> => {
      const result = await requests.commit(message)
      if (!result || result.success !== true) {
        throw new Error(result?.error || 'Commit failed')
      }
      return result
    },
    [requests]
  )

  const readUpstreamStatusForSync = useCallback(async (): Promise<MobileGitUpstreamStatus> => {
    try {
      return await requests.upstreamStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const isUnavailable =
        isRuntimeOrpcErrorCode(error, 'forbidden') ||
        isRuntimeOrpcErrorCode(error, 'method_not_found') ||
        isMobileGitUnavailable(undefined, message)
      if (!isUnavailable) {
        throw error
      }
      const status = await requests.status()
      if (!status.upstreamStatus) {
        throw new Error('Branch status unavailable')
      }
      return status.upstreamStatus
    }
  }, [requests])

  const runGitSyncSteps = useCallback(async (): Promise<MobileSourceControlWorkflowResult> => {
    await requests.fetch()
    const upstreamBeforePull = await readUpstreamStatusForSync()
    if (resolveSourceControlSyncStart(upstreamBeforePull) === 'force_push') {
      try {
        await requests.push({ forceWithLease: true })
      } catch (error) {
        throw markMobileSyncPushStageError(error)
      }
      return { syncPushed: true }
    }
    await requests.pull()
    const upstreamAfterPull = await readUpstreamStatusForSync()
    if (resolveSourceControlSyncAfterPull(upstreamAfterPull) === 'push') {
      try {
        await requests.push()
      } catch (error) {
        throw markMobileSyncPushStageError(error)
      }
      return { syncPushed: true }
    }
    return { syncPushed: false }
  }, [readUpstreamStatusForSync, requests])

  return { gitRequests: requests, sendCommitRequest, runGitSyncSteps }
}
