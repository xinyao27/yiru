import { joinPath } from '~renderer/path'
import { readRuntimeFileContent } from '~renderer/runtime/file-client'
import { useAppStore } from '~renderer/store/state'

import {
  canAutoSaveOpenFile,
  getOpenFilesForExternalFileChange,
  isExternalReloadableEditorTab,
  isWorkingTreeCombinedDiffTab,
  notifyEditorExternalFileChange
} from './autosave'
import { markFileChangedOnDisk } from './changed-on-disk-mark'
import {
  openFileRuntimeOwner,
  type ExternalWatchNotification,
  type WatchedTarget
} from './external-watch-types'
import {
  clearSelfWrite,
  getEditorSelfWriteHostId,
  getRecentSelfWrite,
  type RecentSelfWrite
} from './self-write-registry'
import type { OpenFile } from './state'

const EXTERNAL_RELOAD_DEBOUNCE_MS = 75
const pendingReloadTimers = new Map<string, ReturnType<typeof setTimeout>>()
const inFlightEchoReads = new Map<string, ReturnType<typeof readRuntimeFileContent>>()

export function scheduleExternalReloads(target: WatchedTarget, changedFiles: Set<string>): void {
  const openFiles = useAppStore.getState().openFiles
  const hasCombinedDiffConsumer = openFiles.some(
    (file) =>
      file.worktreeId === target.worktreeId &&
      openFileRuntimeOwner(file) === target.runtimeEnvironmentId &&
      isWorkingTreeCombinedDiffTab(file)
  )
  for (const relativePath of changedFiles) {
    const notification: ExternalWatchNotification = {
      worktreeId: target.worktreeId,
      worktreePath: target.worktreePath,
      relativePath,
      runtimeEnvironmentId: target.runtimeEnvironmentId
    }
    const matching = getOpenFilesForExternalFileChange(openFiles, notification)
    if (matching.length === 0) {
      if (hasCombinedDiffConsumer) {
        scheduleDebouncedExternalReload(notification)
      }
      continue
    }
    const dirtyMatches = matching.filter((file) => file.isDirty)
    if (dirtyMatches.length > 0) {
      scheduleChangedOnDiskMark(
        target,
        notification,
        dirtyMatches.filter(canAutoSaveOpenFile).map((file) => file.id)
      )
      if (dirtyMatches.length === matching.length) {
        if (hasCombinedDiffConsumer) {
          scheduleDebouncedExternalReload(notification)
        }
        continue
      }
    }
    const absolutePath = joinPath(notification.worktreePath, notification.relativePath)
    const recentSelfWrite = getRecentSelfWrite(
      absolutePath,
      getEditorSelfWriteHostId(target.runtimeEnvironmentId, target.connectionId)
    )
    if (recentSelfWrite) {
      scheduleSelfWriteAwareReload(target, notification, matching[0], recentSelfWrite)
    } else {
      scheduleDebouncedExternalReload(notification)
    }
  }
}

export function scheduleDebouncedExternalReload(notification: ExternalWatchNotification): void {
  const key = `${notification.worktreeId}::${notification.runtimeEnvironmentId ?? 'client'}::${notification.relativePath}`
  const existing = pendingReloadTimers.get(key)
  if (existing !== undefined) {
    globalThis.clearTimeout(existing)
  }
  const timer = globalThis.setTimeout(() => {
    pendingReloadTimers.delete(key)
    notifyEditorExternalFileChange(notification)
  }, EXTERNAL_RELOAD_DEBOUNCE_MS)
  pendingReloadTimers.set(key, timer)
}

export function getOverflowExternalReloadTargets(
  target: Pick<WatchedTarget, 'worktreeId' | 'worktreePath'> & {
    runtimeEnvironmentId?: string | null
  }
): ExternalWatchNotification[] {
  const state = useAppStore.getState()
  const notifications: ExternalWatchNotification[] = []
  for (const file of state.openFiles) {
    if (
      file.worktreeId !== target.worktreeId ||
      openFileRuntimeOwner(file) !== (target.runtimeEnvironmentId ?? null) ||
      !isExternalReloadableEditorTab(file) ||
      file.isDirty
    ) {
      continue
    }
    if (file.externalMutation) {
      state.setExternalMutation(file.id, null)
    }
    notifications.push({
      worktreeId: target.worktreeId,
      worktreePath: target.worktreePath,
      relativePath: file.relativePath,
      runtimeEnvironmentId: target.runtimeEnvironmentId ?? null
    })
  }
  return notifications
}

function scheduleChangedOnDiskMark(
  target: WatchedTarget,
  notification: ExternalWatchNotification,
  fileIds: string[]
): void {
  if (fileIds.length === 0) {
    return
  }
  const absolutePath = joinPath(notification.worktreePath, notification.relativePath)
  const recentSelfWrite = getRecentSelfWrite(
    absolutePath,
    getEditorSelfWriteHostId(target.runtimeEnvironmentId, target.connectionId)
  )
  if (!recentSelfWrite || recentSelfWrite.content === null) {
    markTabsChangedOnDisk(fileIds, target.connectionId)
    return
  }
  void readFileForEchoVerification({
    runtimeEnvironmentId: target.runtimeEnvironmentId,
    filePath: absolutePath,
    relativePath: notification.relativePath,
    worktreeId: notification.worktreeId,
    connectionId: target.connectionId
  })
    .then((result) => {
      if (result.isBinary || result.content !== recentSelfWrite.content) {
        markTabsChangedOnDisk(fileIds, target.connectionId)
      }
    })
    .catch(() => markTabsChangedOnDisk(fileIds, target.connectionId))
}

function scheduleSelfWriteAwareReload(
  target: WatchedTarget,
  notification: ExternalWatchNotification,
  file: OpenFile,
  recentSelfWrite: RecentSelfWrite
): void {
  if (recentSelfWrite.content === null) {
    scheduleDebouncedExternalReload(notification)
    return
  }
  const runtimeEnvironmentId = file.runtimeEnvironmentId ?? target.runtimeEnvironmentId
  const releaseSelfWrite = (): void => {
    if (!hasCleanExternalReloadTarget(notification)) {
      return
    }
    clearSelfWrite(
      file.filePath,
      getEditorSelfWriteHostId(runtimeEnvironmentId, target.connectionId)
    )
    scheduleDebouncedExternalReload(notification)
  }
  void readFileForEchoVerification({
    runtimeEnvironmentId,
    filePath: file.filePath,
    relativePath: file.relativePath,
    worktreeId: file.worktreeId,
    connectionId: target.connectionId
  })
    .then((result) => {
      if (result.isBinary || result.content !== recentSelfWrite.content) {
        releaseSelfWrite()
      }
    })
    .catch(releaseSelfWrite)
}

function readFileForEchoVerification(args: {
  runtimeEnvironmentId: string | null | undefined
  filePath: string
  relativePath: string
  worktreeId: string | null | undefined
  connectionId: string | undefined
}): ReturnType<typeof readRuntimeFileContent> {
  const key = `${args.runtimeEnvironmentId ?? ''}::${args.connectionId ?? ''}::${args.filePath}`
  let pending = inFlightEchoReads.get(key)
  if (!pending) {
    pending = readRuntimeFileContent({
      settings: args.runtimeEnvironmentId
        ? { activeRuntimeEnvironmentId: args.runtimeEnvironmentId }
        : null,
      filePath: args.filePath,
      relativePath: args.relativePath,
      worktreeId: args.worktreeId ?? undefined,
      connectionId: args.connectionId
    })
    inFlightEchoReads.set(key, pending)
    const release = (): void => {
      if (inFlightEchoReads.get(key) === pending) {
        inFlightEchoReads.delete(key)
      }
    }
    pending.then(release, release)
  }
  return pending
}

function markTabsChangedOnDisk(fileIds: string[], connectionId: string | undefined): void {
  const state = useAppStore.getState()
  for (const fileId of fileIds) {
    const file = state.openFiles.find((candidate) => candidate.id === fileId)
    if (file) {
      markFileChangedOnDisk(state, file, { connectionId, origin: 'live' })
    }
  }
}

function hasCleanExternalReloadTarget(notification: ExternalWatchNotification): boolean {
  const matching = getOpenFilesForExternalFileChange(useAppStore.getState().openFiles, notification)
  return matching.some((file) => !file.isDirty)
}
