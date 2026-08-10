import { TERMINAL_QUERY_REPLY_INPUT_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/capabilities'
import { useEffect, useRef, useState } from 'react'

import { MOBILE_AI_VAULT_CAPABILITY } from '~/agent-history/capability'
import { supportsMobileQuickCommands } from '~/terminal/quick-commands'
import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'
import type { ConnectionState } from '~/transport/types'

// Why: status.get answers with an unknown payload and only the capability list is
// read here, so narrow it instead of asserting the whole status shape.
function readRuntimeCapabilities(result: unknown): string[] {
  if (typeof result !== 'object' || result === null || !('capabilities' in result)) {
    return []
  }
  const { capabilities } = result
  return Array.isArray(capabilities)
    ? capabilities.filter((entry): entry is string => typeof entry === 'string')
    : []
}

export type MobileHostCapabilitiesDeps = {
  client: RpcClient | null
  connState: ConnectionState
  // Why: a capability that just went unknown must not leave its surface open on
  // a host that may no longer support it.
  onCapabilitiesReset: () => void
}

export type MobileHostCapabilities = {
  browserScreencastSupported: boolean | null
  browserScreencastSupportedRef: React.RefObject<boolean | null>
  agentSessionHistorySupported: boolean | null
  quickCommandsSupported: boolean | null
  hostQueryReplyInputSupportedRef: React.RefObject<boolean>
}

// Probes the connected host's runtime capabilities once per client/connection so
// mobile surfaces that need a newer desktop stay hidden instead of dead-ending.
export function useMobileHostCapabilities(
  deps: MobileHostCapabilitiesDeps
): MobileHostCapabilities {
  const { client, connState, onCapabilitiesReset } = deps
  const [browserScreencastSupported, setBrowserScreencastSupported] = useState<boolean | null>(null)
  // Why: hosts without aiVault.v1 reject aiVault.listSessions, so the header
  // entry stays hidden there (mirrors the gated host-list action) instead of
  // opening a dead-end "update this host" panel.
  const [agentSessionHistorySupported, setAgentSessionHistorySupported] = useState<boolean | null>(
    null
  )
  const [quickCommandsSupported, setQuickCommandsSupported] = useState<boolean | null>(null)
  // Why: stable callbacks (handleFileTap) read the live value via this ref, since
  // the capability probe resolves after the callbacks are created.
  const browserScreencastSupportedRef = useRef(browserScreencastSupported)
  browserScreencastSupportedRef.current = browserScreencastSupported
  const hostQueryReplyInputSupportedRef = useRef(false)

  useEffect(() => {
    if (!client || connState !== 'connected') {
      setBrowserScreencastSupported(null)
      setAgentSessionHistorySupported(null)
      setQuickCommandsSupported(null)
      onCapabilitiesReset()
      hostQueryReplyInputSupportedRef.current = false
      return
    }
    // Why: a client swap may stay connected while moving to an older host.
    setQuickCommandsSupported(null)
    onCapabilitiesReset()
    let stale = false
    void callRuntimeOrpc(client, (runtime) => runtime.status.get, undefined)
      .then((status) => {
        if (stale) {
          return
        }
        const capabilities = readRuntimeCapabilities(status)
        setBrowserScreencastSupported(capabilities.includes('browser.screencast.v1'))
        setAgentSessionHistorySupported(capabilities.includes(MOBILE_AI_VAULT_CAPABILITY))
        setQuickCommandsSupported(supportsMobileQuickCommands(capabilities))
        // Why: hosts without this capability strip inputKind from terminal.send,
        // so a forwarded xterm reply would become floor-stealing shell input.
        hostQueryReplyInputSupportedRef.current = capabilities.includes(
          TERMINAL_QUERY_REPLY_INPUT_RUNTIME_CAPABILITY
        )
      })
      .catch(() => {
        if (!stale) {
          setBrowserScreencastSupported(false)
          setAgentSessionHistorySupported(false)
          setQuickCommandsSupported(false)
          onCapabilitiesReset()
          hostQueryReplyInputSupportedRef.current = false
        }
      })
    return () => {
      stale = true
    }
  }, [client, connState, onCapabilitiesReset])

  return {
    browserScreencastSupported,
    browserScreencastSupportedRef,
    agentSessionHistorySupported,
    quickCommandsSupported,
    hostQueryReplyInputSupportedRef
  }
}
