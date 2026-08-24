export type { SubscribeOptions, WebRuntimeSubscriptionHandle } from './runtime-client/state'

import type { WebRuntimeClientContract } from './runtime-client/contract'
import { WebRuntimeClientHeartbeat } from './runtime-client/heartbeat'
import type { WebRuntimeClientOptions } from './runtime-client/state'

export class WebRuntimeClient extends WebRuntimeClientHeartbeat {
  protected createChildClient(options: WebRuntimeClientOptions): WebRuntimeClientContract {
    return new WebRuntimeClient(this.pairing, this.onRuntimeId, options)
  }
}
