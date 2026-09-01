import { REMOTE_UPDATER_CONTROL_RUNTIME_CAPABILITY } from '../runtime-capability-contract'

// Why: capability checks must use the canonical protocol spelling across
// desktop, web, CLI, and mixed-version paired runtimes.
export const REMOTE_SERVER_UPDATE_CAPABILITY = REMOTE_UPDATER_CONTROL_RUNTIME_CAPABILITY

export type {
  RemoteServerUpdateInstallMode,
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  RemoteServerUpdateSupport
} from '@yiru/runtime-protocol/updater'
