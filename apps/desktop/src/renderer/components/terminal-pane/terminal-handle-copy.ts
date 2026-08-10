import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { makePaneKey } from '~shared/stable-pane-id'

type CopyTerminalHandleDeps = {
  tabId: string
  leafId: string
  writeClipboardText: (text: string) => Promise<void>
}

export async function copyTerminalHandleForPane({
  tabId,
  leafId,
  writeClipboardText
}: CopyTerminalHandleDeps): Promise<string> {
  const paneKey = makePaneKey(tabId, leafId)
  // Why: this action only ever inspects the pane it was invoked from, which
  // is always owned by this desktop's own runtime, never a paired environment.
  const { terminal } = await callRuntimeOrpc(
    { kind: 'local' },
    (client) => client.terminal.resolvePane,
    {
      paneKey
    }
  )
  if (!terminal.handle) {
    throw new Error('Terminal ID unavailable')
  }
  await writeClipboardText(terminal.handle)
  return terminal.handle
}
