import {
  isSpoolRequesterInvokeMethod,
  isSpoolRequesterMutationMethod,
  isSpoolRequesterSubscriptionMethod,
  type SpoolRequesterInvokeArgs,
  type SpoolRequesterRoute,
  type SpoolRequesterSubscriptionArgs
} from '../../shared/spool/spool-ipc-contract'
import type { SpoolDesktopRecord } from './spool-desktop-record'
import type { SpoolPeerConnection } from './spool-peer-connection'
import type { SpoolSubscription } from './spool-peer-connection-contract'

export type SpoolRequesterSubscriptionSink = {
  next(value: unknown): void
  error(error: Error): void
  complete(): void
}

export type SpoolRequesterConnectionBinding = {
  connection: SpoolPeerConnection
  subscriptions: Set<SpoolSubscription>
  isCurrent(): boolean
}

export function bindSpoolRequesterConnection(
  records: ReadonlyMap<string, SpoolDesktopRecord>,
  route: SpoolRequesterRoute
): SpoolRequesterConnectionBinding {
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

export async function invokeSpoolRequesterConnection(
  args: SpoolRequesterInvokeArgs,
  binding: SpoolRequesterConnectionBinding
): Promise<unknown> {
  if (!isSpoolRequesterInvokeMethod(args.method)) {
    throw new Error('method_not_found')
  }
  return await binding.connection.request(args.method, args.params, {
    mutation: isSpoolRequesterMutationMethod(args.method)
  })
}

export function subscribeSpoolRequesterConnection(
  args: SpoolRequesterSubscriptionArgs,
  binding: SpoolRequesterConnectionBinding,
  sink: SpoolRequesterSubscriptionSink
): SpoolSubscription {
  if (!isSpoolRequesterSubscriptionMethod(args.method)) {
    throw new Error('method_not_found')
  }
  let downstream: SpoolSubscription | null = null
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
  const tracked: SpoolSubscription = {
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
