import type { RuntimeUIChangedEvent } from '@yiru/runtime-protocol/contract'

import type { Store } from '../persistence'

// Why: UI-state mutations can originate below the runtime composition root.
// The runtime installs a publisher here at startup so every client sees them.
let publish: (event: RuntimeUIChangedEvent) => void = () => {}

export function initializeRuntimeUIEventSource(store: Store): void {
  store.onUIChanged((ui) => {
    publish({ type: 'changed', ui })
  })
}

export function setUIEventPublisher(publisher: (event: RuntimeUIChangedEvent) => void): void {
  publish = publisher
}
