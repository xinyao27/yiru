import type {
  SharedControlLogicalSubscription,
  SharedControlPendingRequest
} from '@yiru/runtime-protocol/workbench/remote-runtime/shared-control-types'

import { sendSharedControlRequest, sendSharedControlSubscription } from './shared-control-send'
import { rejectSharedControlPendingRequest } from './shared-control-state'
import { sendSharedControlCleanupRequest } from './shared-control-subscriptions'

type RemoteRuntimeSharedControlSenderOptions = {
  deviceToken: string
  pendingRequests: Map<string, SharedControlPendingRequest<unknown>>
  subscriptions: Map<string, SharedControlLogicalSubscription<unknown>>
  sendEncrypted: (payload: unknown) => boolean
}

export class RemoteRuntimeSharedControlSender {
  private readonly options: RemoteRuntimeSharedControlSenderOptions

  constructor(options: RemoteRuntimeSharedControlSenderOptions) {
    this.options = options
  }

  request(requestId: string, method: string, params: unknown): void {
    sendSharedControlRequest({
      pendingRequests: this.options.pendingRequests,
      requestId,
      deviceToken: this.options.deviceToken,
      method,
      params,
      send: this.options.sendEncrypted,
      reject: (id, error) =>
        rejectSharedControlPendingRequest(this.options.pendingRequests, id, error)
    })
  }

  subscription(subscription: SharedControlLogicalSubscription<unknown>): void {
    sendSharedControlSubscription({
      subscriptions: this.options.subscriptions,
      subscription,
      deviceToken: this.options.deviceToken,
      send: this.options.sendEncrypted
    })
  }

  cleanup(method: string, params: unknown): void {
    sendSharedControlCleanupRequest({
      deviceToken: this.options.deviceToken,
      method,
      params,
      send: this.options.sendEncrypted
    })
  }
}
