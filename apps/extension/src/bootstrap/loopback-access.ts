import { verifyRuntimeHealth, type RuntimeHealthBootstrap } from './health'

const LOOPBACK_PERMISSION_TIMEOUT_MS = 60_000

export async function requestRuntimeLoopbackAccess(
  bootstrap: RuntimeHealthBootstrap
): Promise<void> {
  // Why: only a visible document handling a user gesture can make Chrome show the local-network
  // permission prompt; the background service worker is intentionally unable to do so.
  await verifyRuntimeHealth(bootstrap, LOOPBACK_PERMISSION_TIMEOUT_MS)
  globalThis.location.reload()
}
