import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  UpdaterCheckInput
} from '@yiru/runtime-protocol/updater'
import {
  checkRemoteServerUpdater,
  downloadRemoteServerUpdater,
  getRemoteServerUpdaterSnapshot,
  installRemoteServerUpdater
} from '~main/runtime/remote-server-updater'

import type { RpcContext } from '../core'

export function getRuntimeUpdaterStatus(
  _params: void,
  { runtime }: RpcContext
): RemoteServerUpdaterSnapshot {
  return getRemoteServerUpdaterSnapshot(runtime.getRuntimeId())
}

export function checkRuntimeUpdater(
  params: UpdaterCheckInput,
  { runtime }: RpcContext
): RemoteServerUpdaterSnapshot {
  return checkRemoteServerUpdater(runtime.getRuntimeId(), params)
}

export function downloadRuntimeUpdater(
  _params: void,
  { runtime }: RpcContext
): RemoteServerUpdaterSnapshot {
  return downloadRemoteServerUpdater(runtime.getRuntimeId())
}

export function installRuntimeUpdater(
  _params: void,
  { runtime }: RpcContext
): RemoteServerUpdateInstallResult {
  return installRemoteServerUpdater(runtime.getRuntimeId())
}
