import { createBrowserUuid } from '~renderer/browser/uuid'
import { subscribeToRuntimeTerminalData } from '~renderer/runtime/terminal-stream'
import { useAppStore } from '~renderer/store/state'

export function subscribeToPtyData(ptyId: string, watcher: (data: string) => void): () => void {
  let disposed = false
  let unsubscribe: (() => void) | null = null
  void subscribeToRuntimeTerminalData(
    useAppStore.getState().settings,
    ptyId,
    `desktop:sidecar:${createBrowserUuid()}`,
    watcher,
    {
      startAtLiveTail: true,
      delivery: { visible: false, interested: false, priority: 'parked' }
    }
  )
    .then((opened) => {
      if (disposed) {
        opened()
      } else {
        unsubscribe = opened
      }
    })
    .catch(() => {})
  return () => {
    disposed = true
    unsubscribe?.()
  }
}
