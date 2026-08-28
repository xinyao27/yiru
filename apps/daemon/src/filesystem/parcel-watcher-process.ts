import type { WatcherProcessSubscribeOptions } from './parcel-watcher-process-protocol'
import type {
  WatcherProcessCallback,
  WatcherProcessHooks,
  WatcherProcessSubscription
} from './parcel-watcher-process-subscription'
// Host API for crash-isolated @parcel/watcher children. Desktop uses one
// supervisor; runtime roots use a bounded pool with independent crash fuses.
import { WatcherProcessSupervisor } from './parcel-watcher-process-supervisor'
import { RuntimeWatcherProcessPool } from './runtime-watcher-process-pool'

export type {
  WatcherProcessCallback,
  WatcherProcessHooks,
  WatcherProcessSubscription
} from './parcel-watcher-process-subscription'
export type {
  WatcherProcessDeliveryOptions,
  WatcherProcessEvent,
  WatcherProcessSubscribeOptions
} from './parcel-watcher-process-protocol'

const sharedWatcherProcessSupervisor = new WatcherProcessSupervisor()
// Why: healthy roots share one child; only fault quarantine scales to four,
// containing a failed shard without paying that RSS cost during normal use.
const runtimeWatcherProcessPool = new RuntimeWatcherProcessPool()

export function subscribeViaWatcherProcess(
  dir: string,
  callback: WatcherProcessCallback,
  opts: WatcherProcessSubscribeOptions,
  hooks: WatcherProcessHooks = {}
): Promise<WatcherProcessSubscription> {
  return sharedWatcherProcessSupervisor.subscribe(dir, callback, opts, hooks)
}

export function subscribeViaRuntimeWatcherProcess(
  dir: string,
  callback: WatcherProcessCallback,
  opts: WatcherProcessSubscribeOptions,
  hooks: WatcherProcessHooks = {}
): Promise<WatcherProcessSubscription> {
  return runtimeWatcherProcessPool.subscribe(dir, callback, opts, hooks)
}

export function forgetRuntimeWatcherProcessRoot(rootPath: string): void {
  runtimeWatcherProcessPool.forgetRoot(rootPath)
}
