import type { WorkspacePortProbe, WorkspacePortScanResult } from '~shared/workspace/ports'

import { advertisedUrlWatcher, type AdvertisedUrlWatcher } from './advertised-url-watcher'
export {
  parseLsofListeningOutput,
  parseNetstatListeningOutput,
  parseProcNetTcp
} from './local-port-parsers'
import { isPortScanCommandTimeout, scanPlatformListeningPorts } from './local-port-platform-scan'
import {
  compareWorkspacePorts,
  enrichWorkspacePort,
  normalizeWorkspacePortProbes,
  reconcileAdvertisedWorkspaceUrls
} from './workspace-port-attribution'
export { isContainerProcess } from './workspace-port-attribution'
import { WorkspacePortScanTimeoutBackoff } from './workspace-port-scan-timeout-backoff'

const MAX_PORTS = 200
const commandTimeoutBackoff = new WorkspacePortScanTimeoutBackoff()

export async function scanWorkspacePorts(
  worktrees: WorkspacePortProbe[],
  urlWatcher: Pick<AdvertisedUrlWatcher, 'lookup' | 'reconcileScan'> = advertisedUrlWatcher
): Promise<WorkspacePortScanResult> {
  const cooldown = commandTimeoutBackoff.snapshot()
  if (cooldown.isCoolingDown) {
    return makeUnavailableScan(
      `Port scanning is temporarily paused after a command timeout. Retrying in ${Math.ceil(
        cooldown.remainingMs / 1000
      )}s.`
    )
  }
  try {
    const rawPorts = await scanPlatformListeningPorts()
    commandTimeoutBackoff.recordSuccess()
    const normalizedWorktrees = normalizeWorkspacePortProbes(worktrees)
    reconcileAdvertisedWorkspaceUrls(rawPorts, normalizedWorktrees, urlWatcher)
    const ports = rawPorts
      .map((port) => enrichWorkspacePort(port, normalizedWorktrees, urlWatcher))
      .sort(compareWorkspacePorts)
      .slice(0, MAX_PORTS)
    return { platform: process.platform, scannedAt: Date.now(), ports }
  } catch (error) {
    if (isPortScanCommandTimeout(error)) {
      commandTimeoutBackoff.recordTimeout()
    }
    console.warn('[workspace-ports] scan failed', error)
    return makeUnavailableScan(`Port scanning is unavailable on ${process.platform}.`)
  }
}

function makeUnavailableScan(reason: string): WorkspacePortScanResult {
  return {
    platform: process.platform,
    scannedAt: Date.now(),
    ports: [],
    unavailableReason: reason
  }
}
