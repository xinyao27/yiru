import { useEffect, useLayoutEffect, useState } from 'react'

import { useAppStore } from '../store/state'

type TerminalPaneStartupInput = {
  isVisible: boolean
  tabId: string
}

export function useTerminalPaneStartup({ isVisible, tabId }: TerminalPaneStartupInput) {
  const [startup] = useState(() => useAppStore.getState().pendingStartupByTabId[tabId])
  const [setupSplit] = useState(() => useAppStore.getState().pendingSetupSplitByTabId[tabId])
  const [shouldMeasureHiddenStartup, setShouldMeasureHiddenStartup] = useState(
    () => startup !== undefined && !isVisible
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

  useLayoutEffect(() => {
    if (isVisible && shouldMeasureHiddenStartup) {
      // Why: the invisible measurement is only needed until first visibility.
      setShouldMeasureHiddenStartup(false)
    }
  }, [isVisible, shouldMeasureHiddenStartup])

  return { setupSplit, shouldMeasureHiddenStartup, startup }
}
