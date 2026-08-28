import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

export type TerminalViewportClient = {
  id: string
  type?: 'cli' | 'daemon' | 'desktop' | 'extension' | 'mobile'
}

export async function updateViewportForClient(
  runtime: YiruRuntimeService,
  ptyId: string,
  subscriptionKey: string,
  client: TerminalViewportClient,
  viewport: { cols: number; rows: number },
  defaultType: 'mobile' | 'desktop',
  // Why: one-shot viewport requests cannot create width floors because they have no cleanup hook.
  registration: 'register' | 'refresh' = 'register',
  claim = false
): Promise<{ updated: boolean; applied: boolean }> {
  const type = client.type ?? defaultType
  if (type === 'mobile') {
    return runtime.updateMobileViewport(ptyId, client.id, viewport)
  }
  const updated =
    registration === 'refresh'
      ? await runtime.refreshRemoteDesktopViewer(
          ptyId,
          client.id,
          viewport.cols,
          viewport.rows,
          claim
        )
      : await runtime.updateRemoteDesktopViewer(
          ptyId,
          subscriptionKey,
          client.id,
          viewport.cols,
          viewport.rows,
          claim
        )
  return { updated, applied: updated }
}
