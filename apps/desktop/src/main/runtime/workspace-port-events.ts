import type { RuntimeWorkspacePortAdvertisedUrlChangedEvent } from '@yiru/runtime-protocol/contract'

// Why: the advertised-url change is emitted from the workspace-port watcher's
// singleton `onDidChange`, which the workspace-port IPC registration module
// (`main/ports/workspace-ports.ts`) subscribes to at startup — that module
// holds a `Store` but no runtime handle. The runtime installs a publisher
// here at startup, the same shape as `setHostProgressEventPublisher`.
let publish: (event: RuntimeWorkspacePortAdvertisedUrlChangedEvent) => void = () => {}

export function setWorkspacePortEventPublisher(
  publisher: (event: RuntimeWorkspacePortAdvertisedUrlChangedEvent) => void
): void {
  publish = publisher
}

export function publishWorkspacePortAdvertisedUrlChanged(
  event: RuntimeWorkspacePortAdvertisedUrlChangedEvent
): void {
  publish(event)
}
