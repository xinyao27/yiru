import { useEffect, useState } from 'react'

import { useAppStore } from '../store/state'

type TerminalPaneStartupInput = {
  isVisible: boolean
  tabId: string
}

export function useTerminalPaneStartup({ isVisible, tabId }: TerminalPaneStartupInput) {
  const [startup] = useState(() => useAppStore.getState().pendingStartupByTabId[tabId])
  const [setupSplit] = useState(() => useAppStore.getState().pendingSetupSplitByTabId[tabId])
  const shouldMeasureHiddenStartup = useAppStore(
    (store) => store.pendingStartupByTabId[tabId] !== undefined && !isVisible
  )
  const consumeTabStartupCommand = useAppStore((store) => store.consumeTabStartupCommand)
  const consumeTabSetupSplit = useAppStore((store) => store.consumeTabSetupSplit)

  useEffect(() => {
    if (startup) {
      consumeTabStartupCommand(tabId)
    }
  }, [consumeTabStartupCommand, startup, tabId])

  useEffect(() => {
    if (setupSplit) {
      consumeTabSetupSplit(tabId)
    }
  }, [consumeTabSetupSplit, setupSplit, tabId])

  return { setupSplit, shouldMeasureHiddenStartup, startup }
}
