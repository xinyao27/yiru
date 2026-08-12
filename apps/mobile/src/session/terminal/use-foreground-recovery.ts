import { useEffect } from 'react'
import { AppState, Platform, type AppStateStatus } from 'react-native'

import type { TerminalWebViewHandle } from '~/terminal/webview/contract'
import type { RpcClient } from '~/transport/rpc-client'

export type MobileTerminalForegroundRecoveryDeps = {
  client: RpcClient | null
  terminalRefs: React.RefObject<Map<string, TerminalWebViewHandle>>
}

export function useMobileTerminalForegroundRecovery({
  client,
  terminalRefs
}: MobileTerminalForegroundRecoveryDeps): void {
  useEffect(() => {
    if (!client) {
      return
    }
    const handleAppState = (nextState: AppStateStatus): void => {
      if (nextState === 'background' || nextState === 'inactive') {
        client.terminalMultiplexer.setAppState('background')
        return
      }
      if (nextState !== 'active') {
        return
      }
      if (Platform.OS === 'ios') {
        for (const terminalRef of terminalRefs.current.values()) {
          terminalRef.prepareForForegroundRecovery()
        }
      }
      client.terminalMultiplexer.setAppState('foreground')
    }
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  }, [client, terminalRefs])
}
