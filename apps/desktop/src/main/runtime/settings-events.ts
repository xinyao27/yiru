import type { RuntimeSettingsChangedEvent } from '@yiru/runtime-protocol/contract'

// Why: settings changes are broadcast from the store's IPC registration, which
// holds no runtime handle. The runtime installs a publisher here at startup —
// the same shape as `setHostProgressEventPublisher`.
let publish: (event: RuntimeSettingsChangedEvent) => void = () => {}

export function setSettingsEventPublisher(
  publisher: (event: RuntimeSettingsChangedEvent) => void
): void {
  publish = publisher
}

export function publishSettingsChangedEvent(event: RuntimeSettingsChangedEvent): void {
  publish(event)
}
