import { normalizeRuntimePathForComparison } from '@yiru/runtime-protocol/model/platform'
import type { GitWorktreeInfo, Worktree } from '@yiru/runtime-protocol/workbench/types'

import type { Store } from '../persistence/store'
import type { RuntimeFileWatcherLease } from './runtime-file-foundation'
import {
  pendingRuntimeFileWatcherUnsubscribes,
  runtimeFileWatcherLeasesByOwnerAndRoot
} from './runtime-file-foundation'

export function trackRuntimeFileWatcherUnsubscribe(
  rootPath: string,
  unsubscribe: () => Promise<void>
): Promise<void> {
  const promise = Promise.resolve()
    .then(unsubscribe)
    .finally(() => {
      pendingRuntimeFileWatcherUnsubscribes.delete(promise)
    })
  pendingRuntimeFileWatcherUnsubscribes.add(promise)
  void promise.catch((err: unknown) => {
    console.error('[runtime-files.watch] unsubscribe error', { rootPath, err })
  })
  return promise
}

export function normalizeRuntimeWatcherRoot(rootPath: string): string {
  return normalizeRuntimePathForComparison(rootPath)
}

export function runtimeWatcherReleaseKey(runtimeId: string, rootPath: string): string {
  return JSON.stringify([runtimeId, normalizeRuntimeWatcherRoot(rootPath)])
}

export function registerRuntimeFileWatcherRelease(
  runtimeId: string,
  rootPaths: string[],
  unsubscribe: () => Promise<void>,
  restart: () => Promise<() => Promise<void>>,
  onRestoreError: (error: Error) => void
): () => Promise<void> {
  const keys = Array.from(
    new Set(rootPaths.map((rootPath) => runtimeWatcherReleaseKey(runtimeId, rootPath)))
  )
  let currentUnsubscribe: (() => Promise<void>) | null = unsubscribe
  let releasePromise: Promise<void> | null = null
  let resumePromise: Promise<void> | null = null
  let stopPromise: Promise<void> | null = null
  let logicallyStopped = false
  const removeLease = (): void => {
    for (const key of keys) {
      const leases = runtimeFileWatcherLeasesByOwnerAndRoot.get(key)
      leases?.delete(lease)
      if (leases?.size === 0) {
        runtimeFileWatcherLeasesByOwnerAndRoot.delete(key)
      }
    }
  }
  const suspend = (): Promise<void> => {
    if (releasePromise) {
      return releasePromise
    }
    const release = currentUnsubscribe
    if (!release) {
      return Promise.resolve()
    }
    const attempt = trackRuntimeFileWatcherUnsubscribe(rootPaths[0], release)
    releasePromise = attempt
    void attempt.then(
      () => {
        if (currentUnsubscribe === release) {
          currentUnsubscribe = null
        }
        releasePromise = null
      },
      () => {
        releasePromise = null
      }
    )
    return attempt
  }
  const lease: RuntimeFileWatcherLease = {
    suspend,
    resume: () => {
      if (logicallyStopped || currentUnsubscribe) {
        return Promise.resolve()
      }
      if (resumePromise) {
        return resumePromise
      }
      const attempt = Promise.resolve(releasePromise)
        .then(async () => {
          if (logicallyStopped) {
            return
          }
          const nextUnsubscribe = await restart()
          if (logicallyStopped) {
            await nextUnsubscribe()
            return
          }
          currentUnsubscribe = nextUnsubscribe
        })
        .catch((error: unknown) => {
          const restoreError = error instanceof Error ? error : new Error(String(error))
          queueMicrotask(() => onRestoreError(restoreError))
          throw restoreError
        })
        .finally(() => {
          resumePromise = null
        })
      resumePromise = attempt
      return attempt
    },
    forget: () => {
      logicallyStopped = true
      removeLease()
    }
  }
  for (const key of keys) {
    const leases = runtimeFileWatcherLeasesByOwnerAndRoot.get(key) ?? new Set()
    leases.add(lease)
    runtimeFileWatcherLeasesByOwnerAndRoot.set(key, leases)
  }
  return () => {
    if (stopPromise) {
      return stopPromise
    }
    logicallyStopped = true
    const release = resumePromise
      ? Promise.resolve(resumePromise)
          .catch(() => undefined)
          .then(suspend)
      : suspend()
    const attempt = release.then(removeLease).catch((error: unknown) => {
      stopPromise = null
      throw error
    })
    stopPromise = attempt
    return attempt
  }
}

export async function awaitRuntimeFileWatcherUnsubscribes(): Promise<void> {
  await Promise.allSettled(Array.from(pendingRuntimeFileWatcherUnsubscribes))
}

export type ResolvedRuntimeFileWorktree = Worktree & { git: GitWorktreeInfo }
export type ResolvedRuntimeFileTarget = {
  worktree: ResolvedRuntimeFileWorktree
}

export type RuntimeFileCommandHost = {
  getRuntimeId(): string
  requireStore(): Store
  resolveWorktreeSelector(selector: string): Promise<ResolvedRuntimeFileWorktree>
  resolveRuntimeFileTarget(selector: string): Promise<ResolvedRuntimeFileTarget>
  resolveTerminalCwd?(terminalHandle: string): string | null | Promise<string | null>
  resolveTerminalContext?(
    terminalHandle: string
  ): { worktreeId: string; connectionId: string | null } | null
  hasRecentTerminalOutputPath?(
    terminalHandle: string,
    pathText: string,
    absolutePath: string
  ): boolean | Promise<boolean>
  resolveRuntimeGitTarget(selector: string): Promise<{ worktree: ResolvedRuntimeFileWorktree }>
  openFile(
    worktreeId: string,
    filePath: string,
    relativePath: string,
    runtimeEnvironmentId?: string | null
  ): void
  openDiff(
    worktreeId: string,
    filePath: string,
    relativePath: string,
    staged: boolean,
    runtimeEnvironmentId?: string | null
  ): void
}
