import { createRuntimeOrpcClient, type RuntimeClientTarget } from './orpc-client'

// Why: a thin `for await` consumer scoped to one runtime target gives local
// and paired environments the same advertised-url feed without an Electron-only
// BrowserWindow broadcast alongside the runtime event stream.
export function subscribeWorkspacePortAdvertisedUrlChanges(
  target: RuntimeClientTarget,
  onChanged: (event: { worktreeId: string; port: number }) => void
): () => void {
  const controller = new AbortController()
  void (async () => {
    let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
    try {
      connection = await createRuntimeOrpcClient(target, { signal: controller.signal })
      const stream = await connection.client.workspacePorts.events.subscribe(undefined, {
        signal: controller.signal
      })
      for await (const event of stream) {
        if (controller.signal.aborted) {
          return
        }
        if (event.type === 'advertisedUrlChanged') {
          onChanged({ worktreeId: event.worktreeId, port: event.port })
        }
      }
    } catch {
      // Why: an aborted subscription (unmount, or a dropped transport that a
      // reconnect will replace) must not surface as an unhandled rejection.
    } finally {
      connection?.close()
    }
  })()
  return () => controller.abort()
}
