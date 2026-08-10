import type { WorktreeHeadIdentity } from '~shared/types'

// Why: head identities are refreshed deep inside the base-directory watcher,
// which holds an optional BrowserWindow but no runtime handle. Threading a
// runtime reference through the watcher/host-diff call chain for a
// fire-and-forget notification would touch every layer between them, so the
// runtime installs a publisher here at startup instead — the same shape as
// `runtime/host-progress-events.ts`'s `setHostProgressEventPublisher`. Stays a
// no-op until then, which is what headless/early-boot callers need anyway.
let publish: (repoId: string, identities: WorktreeHeadIdentity[]) => void = () => {}

export function setWorktreeHeadIdentityEventPublisher(
  publisher: (repoId: string, identities: WorktreeHeadIdentity[]) => void
): void {
  publish = publisher
}

export function publishWorktreeHeadIdentityEvent(
  repoId: string,
  identities: WorktreeHeadIdentity[]
): void {
  publish(repoId, identities)
}
