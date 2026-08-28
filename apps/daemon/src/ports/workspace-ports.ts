import type { RuntimeWorkspacePortAdvertisedUrlChangedEvent } from '@yiru/runtime-protocol/contract'
import { publishWorkspacePortAdvertisedUrlChanged } from '~main/runtime/workspace-port-events'

import type { Store } from '../persistence/store'
import { advertisedUrlWatcher, type AdvertisedUrlWatcher } from './advertised-url-watcher'
import { getStoreWorkspacePortProbes } from './workspace-port-ownership'

type WorkspacePortHandlersOptions = {
  advertisedUrlEvents?: Pick<AdvertisedUrlWatcher, 'onDidChange'>
}

let unsubscribeAdvertisedUrlChanges: (() => void) | null = null

export function registerWorkspacePortHandlers(
  store: Store,
  options: WorkspacePortHandlersOptions = {}
): void {
  const advertisedUrlEvents = options.advertisedUrlEvents ?? advertisedUrlWatcher

  unsubscribeAdvertisedUrlChanges?.()
  unsubscribeAdvertisedUrlChanges = subscribeWorkspacePortAdvertisedUrlChanges(
    store,
    publishWorkspacePortAdvertisedUrlChanged,
    advertisedUrlEvents
  )
}

// Why: PTY output feeds this watcher in both Electron and the Node host. Keep
// the Store ownership filter next to the source so neither runtime leaks another host's URLs.
export function subscribeWorkspacePortAdvertisedUrlChanges(
  store: Store,
  listener: (event: RuntimeWorkspacePortAdvertisedUrlChangedEvent) => void,
  advertisedUrlEvents: Pick<AdvertisedUrlWatcher, 'onDidChange'> = advertisedUrlWatcher
): () => void {
  return advertisedUrlEvents.onDidChange((event) => {
    const localWorktrees = getStoreWorkspacePortProbes(store)
    if (!localWorktrees.some((worktree) => worktree.id === event.worktreeId)) {
      return
    }
    listener({ type: 'advertisedUrlChanged', ...event })
  })
}
