import {
  UPDATER_CHECK_CONTRACT,
  UPDATER_DOWNLOAD_CONTRACT,
  UPDATER_GET_STATUS_CONTRACT,
  UPDATER_INSTALL_CONTRACT
} from '../../../../shared/runtime-method-contracts/runtime-control-contracts'
import {
  checkRemoteServerUpdater,
  downloadRemoteServerUpdater,
  getRemoteServerUpdaterSnapshot,
  installRemoteServerUpdater
} from '../../remote-server-updater'
import { defineMethod, type RpcMethod } from '../core'

export const UPDATER_METHODS: RpcMethod[] = [
  defineMethod({
    contract: UPDATER_GET_STATUS_CONTRACT,
    handler: (_params, { runtime }) => getRemoteServerUpdaterSnapshot(runtime.getRuntimeId())
  }),
  defineMethod({
    contract: UPDATER_CHECK_CONTRACT,
    handler: (params, { runtime }) => checkRemoteServerUpdater(runtime.getRuntimeId(), params)
  }),
  defineMethod({
    contract: UPDATER_DOWNLOAD_CONTRACT,
    handler: (_params, { runtime }) => downloadRemoteServerUpdater(runtime.getRuntimeId())
  }),
  defineMethod({
    contract: UPDATER_INSTALL_CONTRACT,
    handler: (_params, { runtime }) => installRemoteServerUpdater(runtime.getRuntimeId())
  })
]
