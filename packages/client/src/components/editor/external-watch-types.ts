import type { OpenFile } from './state'

export type ExternalWatchNotification = {
  worktreeId: string
  worktreePath: string
  relativePath: string
  runtimeEnvironmentId: string | null
}

export type WatchedTarget = {
  worktreeId: string
  worktreePath: string
  connectionId: string | undefined
  runtimeEnvironmentId: string | null
}

export type WatchedTargetsSnapshot = {
  targets: WatchedTarget[]
  targetsKey: string
}

export function openFileRuntimeOwner(file: Pick<OpenFile, 'runtimeEnvironmentId'>): string | null {
  return file.runtimeEnvironmentId?.trim() || null
}
