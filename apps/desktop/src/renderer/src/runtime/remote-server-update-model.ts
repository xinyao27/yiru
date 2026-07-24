import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  RemoteServerUpdateSupport
} from '../../../shared/remote-server-update'
import type { PublicKnownRuntimeEnvironment } from '../../../shared/runtime-environments'
import type { RuntimeStatus } from '../../../shared/runtime-types'
import type { UpdateCheckOptions } from '../../../shared/types'

export type RemoteServerUpdatePhase =
  | 'checking'
  | 'available'
  | 'current'
  | 'manual'
  | 'offline'
  | 'queued'
  | 'checking-update'
  | 'downloading'
  | 'restarting'
  | 'updated'
  | 'failed'

export type RemoteServerUpdateEntry = {
  environmentId: string
  name: string
  phase: RemoteServerUpdatePhase
  currentVersion: string | null
  targetVersion: string | null
  progress: number | null
  runtimeId: string | null
  liveTabCount: number
  liveLeafCount: number
  support: RemoteServerUpdateSupport | null
  error: string | null
}

export type RemoteServerUpdateTransport = {
  getRuntimeStatus: (environmentId: string, timeoutMs?: number) => Promise<RuntimeStatus>
  getUpdaterStatus: (environmentId: string) => Promise<RemoteServerUpdaterSnapshot>
  check: (
    environmentId: string,
    options: UpdateCheckOptions
  ) => Promise<RemoteServerUpdaterSnapshot>
  download: (environmentId: string) => Promise<RemoteServerUpdaterSnapshot>
  install: (environmentId: string) => Promise<RemoteServerUpdateInstallResult>
  wait: (milliseconds: number) => Promise<void>
  now?: () => number
}

export type RemoteServerUpdateTiming = {
  operationTimeoutMs: number
  reconnectTimeoutMs: number
  pollIntervalMs: number
}

export const DEFAULT_REMOTE_SERVER_UPDATE_TIMING: RemoteServerUpdateTiming = {
  operationTimeoutMs: 10 * 60 * 1000,
  reconnectTimeoutMs: 3 * 60 * 1000,
  pollIntervalMs: 500
}

export type RemoteServerUpdateRunOptions = {
  checkOptions?: UpdateCheckOptions
  timing?: RemoteServerUpdateTiming
}

export function checkingRemoteServerUpdateEntry(
  environment: PublicKnownRuntimeEnvironment
): RemoteServerUpdateEntry {
  return {
    environmentId: environment.id,
    name: environment.name,
    phase: 'checking',
    currentVersion: null,
    targetVersion: null,
    progress: null,
    runtimeId: null,
    liveTabCount: 0,
    liveLeafCount: 0,
    support: null,
    error: null
  }
}
