import type { RuntimeAgentStatusEvent } from '@yiru/runtime-protocol/contract'

// Why: agent status is broadcast from the hook-server listeners wired in
// `index.ts`, which hold a BrowserWindow but no runtime handle. The runtime
// installs a publisher here at startup — the same shape as
// `setHostProgressEventPublisher`.
let publish: (event: RuntimeAgentStatusEvent) => void = () => {}

export function setAgentStatusEventPublisher(
  publisher: (event: RuntimeAgentStatusEvent) => void
): void {
  publish = publisher
}

export function publishAgentStatusEvent(event: RuntimeAgentStatusEvent): void {
  publish(event)
}
