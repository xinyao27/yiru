import { STATUS_GET_CONTRACT } from '../../../../shared/runtime-method-contracts/runtime-control-contracts'
import { getRemoteServerUpdaterSnapshot } from '../../remote-server-updater'
import { defineMethod, type RpcMethod } from '../core'

export const STATUS_METHODS: RpcMethod[] = [
  defineMethod({
    contract: STATUS_GET_CONTRACT,
    handler: (_params, { runtime }) => {
      const snapshot = getRemoteServerUpdaterSnapshot(runtime.getRuntimeId())
      return {
        ...runtime.getStatus(),
        appVersion: snapshot.appVersion,
        remoteUpdateSupport: snapshot.support
      }
    }
  })
]
