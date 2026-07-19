import {
  sendSharedControlRequest,
  sendSharedControlSubscription
} from './remote-runtime-shared-control-send'
import { rejectSharedControlPendingRequest } from './remote-runtime-shared-control-state'
import { sendSharedControlCleanupRequest } from './remote-runtime-shared-control-subscriptions'
import type {
  SharedControlLogicalSubscription,
  SharedControlPendingRequest
} from './remote-runtime-shared-control-types'

type RemoteRuntimeSharedControlSenderOptions = {
  deviceToken: string
  pendingRequests: Map<string, SharedControlPendingRequest<unknown>>
  subscriptions: Map<string, SharedControlLogicalSubscription<unknown>>
  sendEncrypted: (payload: unknown) => boolean
}

export class RemoteRuntimeSharedControlSender {
  constructor(private readonly options: RemoteRuntimeSharedControlSenderOptions) {}

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
