import type { RuntimeUIChangedEvent } from '@yiru/runtime-protocol/contract'

// Why: UI-state changes are broadcast from the store's IPC registration, which
// holds no runtime handle. The runtime installs a publisher here at startup —
// the same shape as `setSettingsEventPublisher`.
let publish: (event: RuntimeUIChangedEvent) => void = () => {}

export function setUIEventPublisher(publisher: (event: RuntimeUIChangedEvent) => void): void {
  publish = publisher
}

export function publishUIChangedEvent(event: RuntimeUIChangedEvent): void {
  publish(event)
}
