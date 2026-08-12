import type { RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { subscribeToRuntimeTerminalData } from '~renderer/runtime/terminal-stream'
import { useAppStore } from '~renderer/store'

function persistExitedPaneOutput(tabId: string, leafId: string, output: string): void {
  const store = useAppStore.getState()
  const layout = store.terminalLayoutsByTabId[tabId]
  if (!layout) {
    return
  }
  const { ptyIdsByLeafId: existingPtyIds, buffersByLeafId: existingBuffers, ...rest } = layout
  const nextPtyIds = { ...existingPtyIds }
  delete nextPtyIds[leafId]
  const trimmedOutput = output.trim() ? output : ''
  store.setTabLayout(tabId, {
    ...rest,
    ...(Object.keys(nextPtyIds).length > 0 ? { ptyIdsByLeafId: nextPtyIds } : {}),
    ...(trimmedOutput
      ? { buffersByLeafId: { ...existingBuffers, [leafId]: output } }
      : existingBuffers
        ? { buffersByLeafId: existingBuffers }
        : {})
  })
}

export function registerBackgroundTerminalBuffer(args: {
  tabId: string
  leafId: string
  ptyId: string
  terminal: string
  runtimeTarget: RuntimeClientTarget
}): void {
  let output = ''
  let unsubscribe = (): void => {}
  void subscribeToRuntimeTerminalData(
    useAppStore.getState().settings,
    args.ptyId,
    `desktop:background-setup:${args.tabId}:${args.leafId}`,
    (data) => {
      output += data
    }
  ).then((dispose) => {
    unsubscribe = dispose
  })
  void callRuntimeOrpc(
    args.runtimeTarget,
    (client) => client.terminal.wait,
    { terminal: args.terminal, for: 'exit' },
    { timeoutMs: 24 * 60 * 60 * 1_000 }
  )
    .then(() => {
      unsubscribe()
      persistExitedPaneOutput(args.tabId, args.leafId, output)
      useAppStore.getState().clearTabPtyId(args.tabId, args.ptyId)
    })
    .catch(() => {})
}
