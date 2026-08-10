import type { RuntimeHostProgressEvent } from '@yiru/runtime-protocol/contract'

// Why: clone and worktree-create progress is emitted from deep inside the repo
// and worktree subsystems, which hold a BrowserWindow but no runtime handle.
// Threading one through every call site would touch a dozen signatures across
// two subsystems for a fire-and-forget notification, so the runtime installs a
// publisher here at startup — the same shape as
// `BrowserManager.setGuestEventPublisher`. Stays a no-op until then, which is
// what headless/early-boot callers need anyway.
let publish: (event: RuntimeHostProgressEvent) => void = () => {}

export function setHostProgressEventPublisher(
  publisher: (event: RuntimeHostProgressEvent) => void
): void {
  publish = publisher
}

export function publishHostProgressEvent(event: RuntimeHostProgressEvent): void {
  publish(event)
}
