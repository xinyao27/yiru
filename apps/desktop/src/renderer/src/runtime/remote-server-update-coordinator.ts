import {
  compareAppVersions,
  isPerfPrereleaseAppVersion,
  isPrereleaseAppVersion,
  isValidAppVersion
} from '../../../shared/app-version'
import { REMOTE_SERVER_UPDATE_CAPABILITY } from '../../../shared/remote-server-update'
import type { PublicKnownRuntimeEnvironment } from '../../../shared/runtime-environments'
import type { RuntimeStatus } from '../../../shared/runtime-types'
import type { UpdateCheckOptions } from '../../../shared/types'
import { remoteServerUpdateErrorMessage } from './remote-server-update-errors'
import {
  checkingRemoteServerUpdateEntry,
  DEFAULT_REMOTE_SERVER_UPDATE_TIMING,
  type RemoteServerUpdateEntry,
  type RemoteServerUpdateRunOptions,
  type RemoteServerUpdateTiming,
  type RemoteServerUpdateTransport
} from './remote-server-update-model'
import { pollRemoteServerUpdater } from './remote-server-updater-polling'

export { checkingRemoteServerUpdateEntry, DEFAULT_REMOTE_SERVER_UPDATE_TIMING }
export type {
  RemoteServerUpdateEntry,
  RemoteServerUpdatePhase,
  RemoteServerUpdateRunOptions,
  RemoteServerUpdateTiming,
  RemoteServerUpdateTransport
} from './remote-server-update-model'

export async function inspectRemoteServerUpdate(
  environment: PublicKnownRuntimeEnvironment,
  clientVersion: string,
  transport: RemoteServerUpdateTransport,
  checkOptions?: UpdateCheckOptions,
  timing: RemoteServerUpdateTiming = DEFAULT_REMOTE_SERVER_UPDATE_TIMING
): Promise<RemoteServerUpdateEntry> {
  const base = checkingRemoteServerUpdateEntry(environment)
  let status: RuntimeStatus
  try {
    status = await transport.getRuntimeStatus(environment.id, 10_000)
  } catch (error) {
    return {
      ...base,
      phase: 'offline',
      error: error instanceof Error ? error.message : String(error)
    }
  }

  const currentVersion = status.appVersion?.trim() || null
  const supportsRemoteUpdate = status.capabilities?.includes(REMOTE_SERVER_UPDATE_CAPABILITY)
  const support = status.remoteUpdateSupport ?? null
  const versionComparable =
    currentVersion !== null && isValidAppVersion(currentVersion) && isValidAppVersion(clientVersion)
  const outdated = versionComparable && compareAppVersions(currentVersion, clientVersion) < 0
  const statusFields = {
    currentVersion,
    runtimeId: status.runtimeId,
    liveTabCount: status.liveTabCount,
    liveLeafCount: status.liveLeafCount,
    support
  }

  if (!supportsRemoteUpdate || !support?.automatic) {
    return {
      ...base,
      ...statusFields,
      phase: versionComparable && !outdated ? 'current' : 'manual',
      targetVersion: versionComparable ? clientVersion : null
    }
  }

  if (checkOptions) {
    try {
      const first = await transport.check(environment.id, checkOptions)
      if (first.runtimeId !== status.runtimeId) {
        throw new Error('remote_update_runtime_changed')
      }
      const checked =
        first.status.state === 'available' || first.status.state === 'not-available'
          ? first
          : await pollRemoteServerUpdater(
              environment.id,
              status.runtimeId,
              transport,
              timing,
              (snapshot) =>
                snapshot.status.state === 'available' || snapshot.status.state === 'not-available',
              () => undefined
            )
      if (checked.status.state === 'available') {
        return {
          ...base,
          ...statusFields,
          phase: 'available',
          targetVersion: checked.status.version
        }
      }
      return {
        ...base,
        ...statusFields,
        phase: 'current',
        targetVersion: currentVersion
      }
    } catch (error) {
      return {
        ...base,
        ...statusFields,
        phase: 'failed',
        targetVersion: null,
        error: remoteServerUpdateErrorMessage(error)
      }
    }
  }

  return {
    ...base,
    ...statusFields,
    phase: versionComparable && !outdated ? 'current' : 'available',
    targetVersion: clientVersion
  }
}

function updateReachedTarget(currentVersion: string, targetVersion: string): boolean {
  return (
    isValidAppVersion(currentVersion) &&
    isValidAppVersion(targetVersion) &&
    compareAppVersions(currentVersion, targetVersion) >= 0
  )
}

export async function runRemoteServerUpdate(
  entry: RemoteServerUpdateEntry,
  transport: RemoteServerUpdateTransport,
  onProgress: (entry: RemoteServerUpdateEntry) => void,
  options: RemoteServerUpdateRunOptions = {}
): Promise<RemoteServerUpdateEntry> {
  const timing = options.timing ?? DEFAULT_REMOTE_SERVER_UPDATE_TIMING
  let next: RemoteServerUpdateEntry = {
    ...entry,
    phase: 'checking-update',
    progress: null,
    error: null
  }
  onProgress(next)
  try {
    if (!entry.runtimeId) {
      throw new Error('remote_update_runtime_changed')
    }
    const inferredCheckOptions = {
      includePrerelease:
        entry.targetVersion !== null && isPrereleaseAppVersion(entry.targetVersion),
      includePerfPrerelease:
        entry.targetVersion !== null && isPerfPrereleaseAppVersion(entry.targetVersion)
    }
    const first = await transport.check(
      entry.environmentId,
      options.checkOptions ?? inferredCheckOptions
    )
    if (first.runtimeId !== entry.runtimeId) {
      throw new Error('remote_update_runtime_changed')
    }
    const available = await pollRemoteServerUpdater(
      entry.environmentId,
      entry.runtimeId,
      transport,
      timing,
      (snapshot) =>
        snapshot.status.state === 'available' || snapshot.status.state === 'not-available',
      () => undefined
    )
    if (available.status.state === 'not-available') {
      const status = await transport.getRuntimeStatus(entry.environmentId, 10_000)
      const currentVersion = status.appVersion?.trim() ?? ''
      if (
        status.runtimeId !== entry.runtimeId ||
        !entry.targetVersion ||
        !updateReachedTarget(currentVersion, entry.targetVersion)
      ) {
        throw new Error('remote_update_requested_version_unavailable')
      }
      next = { ...next, phase: 'current', currentVersion, runtimeId: status.runtimeId }
      onProgress(next)
      return next
    }
    if (available.status.state !== 'available') {
      throw new Error('remote_update_status_unavailable')
    }
    if (
      entry.targetVersion &&
      isValidAppVersion(entry.targetVersion) &&
      compareAppVersions(available.status.version, entry.targetVersion) < 0
    ) {
      throw new Error('remote_update_requested_version_unavailable')
    }

    next = {
      ...next,
      phase: 'downloading',
      targetVersion: available.status.version,
      progress: 0
    }
    onProgress(next)
    const download = await transport.download(entry.environmentId)
    if (download.runtimeId !== entry.runtimeId) {
      throw new Error('remote_update_runtime_changed')
    }
    const downloaded = await pollRemoteServerUpdater(
      entry.environmentId,
      entry.runtimeId,
      transport,
      timing,
      (snapshot) => snapshot.status.state === 'downloaded',
      (snapshot) => {
        if (snapshot.status.state === 'downloading') {
          next = { ...next, progress: snapshot.status.percent }
          onProgress(next)
        }
      }
    )
    if (downloaded.status.state !== 'downloaded') {
      throw new Error('remote_update_download_incomplete')
    }

    const install = await transport.install(entry.environmentId)
    if (install.runtimeId !== entry.runtimeId) {
      throw new Error('remote_update_runtime_changed')
    }
    next = { ...next, phase: 'restarting', targetVersion: install.targetVersion, progress: null }
    onProgress(next)

    const now = transport.now ?? Date.now
    const reconnectDeadline = now() + timing.reconnectTimeoutMs
    while (now() < reconnectDeadline) {
      try {
        const status = await transport.getRuntimeStatus(entry.environmentId, 10_000)
        const version = status.appVersion?.trim() ?? ''
        if (
          status.runtimeId !== install.runtimeId &&
          updateReachedTarget(version, install.targetVersion)
        ) {
          next = {
            ...next,
            phase: 'updated',
            currentVersion: version,
            runtimeId: status.runtimeId,
            liveTabCount: status.liveTabCount,
            liveLeafCount: status.liveLeafCount
          }
          onProgress(next)
          return next
        }
      } catch {
        // A refused connection is expected while the owning runtime restarts.
      }
      await transport.wait(Math.min(timing.pollIntervalMs, Math.max(0, reconnectDeadline - now())))
    }
    throw new Error('remote_update_reconnect_timeout')
  } catch (error) {
    next = {
      ...next,
      phase: 'failed',
      progress: null,
      error: remoteServerUpdateErrorMessage(error)
    }
    onProgress(next)
    return next
  }
}
