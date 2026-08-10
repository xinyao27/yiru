import type { RuntimeGitHubEvent } from '@yiru/runtime-protocol/contract'

// Why: PR refresh ticks and work-item mutations originate in the GitHub
// subsystem, which holds no runtime handle. The runtime installs a publisher here at startup —
// the same shape as `setHostProgressEventPublisher` — so paired clients get the
// same signal without threading a handle through the review call graph.
let publish: (event: RuntimeGitHubEvent) => void = () => {}

export function setGitHubEventPublisher(publisher: (event: RuntimeGitHubEvent) => void): void {
  publish = publisher
}

export function publishGitHubEvent(event: RuntimeGitHubEvent): void {
  publish(event)
}
