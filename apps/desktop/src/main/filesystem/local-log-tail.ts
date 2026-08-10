import type { Store } from '../persistence'
import { resolveAuthorizedPath } from './auth'

// Why: the runtime's log-tail methods (files.readLogTail/watchLogTail —
// main/runtime/rpc/methods/log-tail-methods.ts) are the only path left to this
// feature; the classic local-log-tail IPC channels were retired in favor of the editor
// calling the runtime contract directly (renderer/components/editor/
// local-log-tail-runtime.ts). Keeping the store here — rather than
// re-plumbing one through the runtime — leaves `resolveAuthorizedPath` with a
// single caller-visible gate for this feature.
let authorizedStore: Store | null = null

export function initializeLocalLogTailAuthorization(store: Store): void {
  authorizedStore = store
}

export async function resolveAuthorizedLogTailPath(filePath: string): Promise<string> {
  if (!authorizedStore) {
    throw new Error('Local log tail is unavailable before store initialization')
  }
  return resolveAuthorizedPath(filePath, authorizedStore)
}
