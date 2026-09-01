import { randomUUID } from 'node:crypto'

import type { PairingOffer } from '@yiru/runtime-protocol/workbench/pairing'

import type { RemoteRuntimeSocketLivenessOptions } from './socket-liveness'
import { RemoteRuntimeSubscriptionSession } from './subscription-session'
import { openRemoteRuntimeSubscriptionSocket } from './subscription-socket'
import type {
  RemoteRuntimeSubscription,
  RemoteRuntimeSubscriptionCallbacks
} from './subscription-types'

export async function subscribeRemoteRuntimeRequest<TResult>(
  pairing: PairingOffer,
  method: string,
  params: unknown,
  timeoutMs: number,
  callbacks: RemoteRuntimeSubscriptionCallbacks<TResult>,
  livenessOptions?: RemoteRuntimeSocketLivenessOptions
): Promise<RemoteRuntimeSubscription> {
  return await new Promise((resolve, reject) => {
    const session = new RemoteRuntimeSubscriptionSession({
      callbacks,
      method,
      pairing,
      params,
      reject,
      requestId: randomUUID(),
      resolve,
      timeoutMs
    })
    openRemoteRuntimeSubscriptionSocket(session, livenessOptions)
  })
}
