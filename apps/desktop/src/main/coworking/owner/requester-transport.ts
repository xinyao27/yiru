import {
  isCoworkingRequesterInvokeMethod,
  isCoworkingRequesterMutationMethod,
  isCoworkingRequesterSubscriptionMethod,
  type CoworkingRequesterInvokeArgs,
  type CoworkingRequesterRoute,
  type CoworkingRequesterSubscriptionArgs
} from '~shared/coworking/ipc-contract'

import type { CoworkingPeerConnection } from '../peer/connection'
import type { CoworkingSubscription } from '../peer/connection-contract'
import type { CoworkingOwnerRecord } from './record'

export type CoworkingRequesterSubscriptionSink = {
  next(value: unknown): void
  error(error: Error): void
  complete(): void
}

export type CoworkingRequesterConnectionBinding = {
  connection: CoworkingPeerConnection
  subscriptions: Set<CoworkingSubscription>
  isCurrent(): boolean
}

export function bindCoworkingRequesterConnection(
  records: ReadonlyMap<string, CoworkingOwnerRecord>,
  route: CoworkingRequesterRoute
): CoworkingRequesterConnectionBinding {
  const record = records.get(route.desktopRef)
  const connection = record?.connection ?? null
  if (
    !record ||
    !connection ||
    record.status !== 'connected' ||
    record.connectionEpoch !== route.connectionEpoch
  ) {
    throw new Error('resource_unavailable')
  }
  return {
    connection,
    subscriptions: record.requesterSubscriptions,
    isCurrent: () =>
      records.get(route.desktopRef) === record &&
      record.connection === connection &&
      record.status === 'connected' &&
      record.connectionEpoch === route.connectionEpoch
  }
}

export async function invokeCoworkingRequesterConnection(
  args: CoworkingRequesterInvokeArgs,
  binding: CoworkingRequesterConnectionBinding
): Promise<unknown> {
  if (!isCoworkingRequesterInvokeMethod(args.method)) {
    throw new Error('method_not_found')
  }
  return await binding.connection.request(args.method, args.params, {
    mutation: isCoworkingRequesterMutationMethod(args.method)
  })
}

export function subscribeCoworkingRequesterConnection(
  args: CoworkingRequesterSubscriptionArgs,
  binding: CoworkingRequesterConnectionBinding,
  sink: CoworkingRequesterSubscriptionSink
): CoworkingSubscription {
  if (!isCoworkingRequesterSubscriptionMethod(args.method)) {
    throw new Error('method_not_found')
  }
  let downstream: CoworkingSubscription | null = null
  let settled = false
  let closed = false
  let sinkSettled = false
  const completeSink = (): void => {
    if (sinkSettled) {
      return
    }
    sinkSettled = true
    sink.complete()
  }
  const tracked: CoworkingSubscription = {
    close: () => {
      if (closed) {
        return
      }
      closed = true
      binding.subscriptions.delete(tracked)
      downstream?.close()
      // Why: disconnect and epoch invalidation must also release the renderer stream.
      completeSink()
    }
  }
  binding.subscriptions.add(tracked)
  const release = (): void => {
    settled = true
    closed = true
    binding.subscriptions.delete(tracked)
  }
  downstream = binding.connection.subscribe(args.method, args.params, {
    next: (value) => {
      if (!binding.isCurrent()) {
        tracked.close()
        return
      }
      sink.next(value)
    },
    error: (error) => {
      release()
      if (!sinkSettled) {
        sinkSettled = true
        sink.error(error)
      }
    },
    complete: () => {
      release()
      completeSink()
    }
  })
  if (settled || closed) {
    downstream.close()
  }
  return tracked
}
