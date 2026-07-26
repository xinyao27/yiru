import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'

import { sendToWatcherChild } from './parcel-watcher-child-messaging'
import { createHostWatcherSubscription } from './parcel-watcher-host-subscriptions'
import type { PendingWatcherUnsubscribe } from './parcel-watcher-host-subscriptions'
import {
  installPendingSubscribeControls,
  resetPendingSubscribeAttempt
} from './parcel-watcher-pending-subscribe'
import { WatcherProcessFailure } from './parcel-watcher-process-failure'
import type {
  HostToWatcherMessage,
  WatcherProcessSubscribeOptions
} from './parcel-watcher-process-protocol'
import type {
  WatcherProcessCallback,
  WatcherProcessHooks,
  WatcherProcessSubscription,
  WatcherProcessSubscriptionRecord
} from './parcel-watcher-process-subscription'

type WatcherSupervisorSubscribeOptions = {
  dir: string
  callback: WatcherProcessCallback
  opts: WatcherProcessSubscribeOptions
  hooks: WatcherProcessHooks
  shutdownRequested: boolean
  entryPath: string
  allocateId: () => number
  records: Map<number, WatcherProcessSubscriptionRecord>
  pendingUnsubscribes: Map<number, PendingWatcherUnsubscribe>
  ensureWatcherProcess: (entryPath: string) => ChildProcess | null
  getChild: () => ChildProcess | null
  getTerminationPromise: () => Promise<void> | null
  killWatcherChildIfIdle: () => Promise<void>
  terminateUnavailableChild: (child: ChildProcess | null) => Promise<void>
  sendSubscribe: (child: ChildProcess, record: WatcherProcessSubscriptionRecord) => void
  sendToChild: (child: ChildProcess, message: HostToWatcherMessage) => void
  cancelPendingSubscribe: (
    record: WatcherProcessSubscriptionRecord,
    error: WatcherProcessFailure
  ) => void
}

export function sendWatcherSubscribe(
  child: ChildProcess,
  record: WatcherProcessSubscriptionRecord
): void {
  resetPendingSubscribeAttempt(record)
  sendToWatcherChild(child, {
    op: 'subscribe',
    id: record.id,
    dir: record.dir,
    opts: record.opts,
    delivery: record.hooks.delivery
  })
}

export function subscribeThroughWatcherSupervisor({
  dir,
  callback,
  opts,
  hooks,
  shutdownRequested,
  entryPath,
  allocateId,
  records,
  pendingUnsubscribes,
  ensureWatcherProcess,
  getChild,
  getTerminationPromise,
  killWatcherChildIfIdle,
  terminateUnavailableChild,
  sendSubscribe,
  sendToChild,
  cancelPendingSubscribe
}: WatcherSupervisorSubscribeOptions): Promise<WatcherProcessSubscription> {
  if (shutdownRequested) {
    return Promise.reject(
      new WatcherProcessFailure(
        'file watcher supervisor disposed',
        'supervisor',
        'supervisor_disposed'
      )
    )
  }
  if (hooks.signal?.aborted) {
    return Promise.reject(
      new WatcherProcessFailure(
        'file watcher subscription aborted',
        'subscription',
        'subscribe_aborted'
      )
    )
  }
  if (!existsSync(entryPath)) {
    return Promise.reject(
      new WatcherProcessFailure(
        `watcher process entry is missing: ${entryPath}`,
        'supervisor',
        'entry_missing'
      )
    )
  }
  const record: WatcherProcessSubscriptionRecord = {
    id: allocateId(),
    dir,
    opts,
    callback,
    hooks,
    interrupted: false,
    crawlStarted: false
  }
  return new Promise((resolve, reject) => {
    const child = ensureWatcherProcess(entryPath)
    if (!child) {
      reject(
        new WatcherProcessFailure(
          'file watcher process unavailable',
          'supervisor',
          'process_unavailable'
        )
      )
      return
    }
    records.set(record.id, record)
    record.pendingSubscribe = {
      resolve: () =>
        resolve(
          createHostWatcherSubscription({
            record,
            records,
            pendingUnsubscribes,
            getChild,
            getTerminationPromise,
            killWatcherChildIfIdle,
            terminateUnavailableChild,
            sendToChild
          })
        ),
      reject
    }
    installPendingSubscribeControls(record, (error) => cancelPendingSubscribe(record, error))
    sendSubscribe(child, record)
  })
}
