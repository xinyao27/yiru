import { REMOTE_UPDATER_CONTROL_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/capabilities'

import type { UpdateStatus } from './types'

// Why: capability checks must use the canonical protocol spelling across
// desktop, web, CLI, and mixed-version paired runtimes.
export const REMOTE_SERVER_UPDATE_CAPABILITY = REMOTE_UPDATER_CONTROL_RUNTIME_CAPABILITY

export type RemoteServerUpdateInstallMode =
  | 'interactive'
  | 'supervised-headless-serve'
  | 'unsupported-headless-serve'

export type RemoteServerUpdateSupport = {
  installMode: RemoteServerUpdateInstallMode
  automatic: boolean
  reason:
    | 'available'
    | 'manual-service-update-required'
    | 'unpackaged-build'
    | 'updater-unavailable'
}

export type RemoteServerUpdaterSnapshot = {
  appVersion: string
  runtimeId: string
  support: RemoteServerUpdateSupport
  status: UpdateStatus
}

export type RemoteServerUpdateInstallResult = {
  accepted: true
  fromVersion: string
  targetVersion: string
  runtimeId: string
}
