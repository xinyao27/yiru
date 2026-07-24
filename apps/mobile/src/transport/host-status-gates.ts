import {
  evaluateMobileRuntimeCompat,
  type MobileRuntimeCompatVerdict
} from '@yiru/runtime-protocol/capabilities'
import { useEffect, useState } from 'react'

import type { DesktopStatus } from '../worktree/host-worktree-rpc-types'
import type { RpcClient } from './rpc-client'
import type { ConnectionState, RpcSuccess } from './types'

export type HostStatusGates = {
  // Undefined means status.get has not produced an authoritative answer yet;
  // an empty array means the connected host explicitly advertised no capabilities.
  hostCapabilities: string[] | undefined
  floatingWorkspaceEnabled: boolean
  compatVerdict: MobileRuntimeCompatVerdict
}

type LoadedHostStatusGates = HostStatusGates & {
  hostId: string | undefined
  client: RpcClient
}

export function deriveHostStatusGates(
  status: DesktopStatus & { capabilities?: string[] }
): HostStatusGates {
  return {
    hostCapabilities: status.capabilities ?? [],
    // Why: absent on older hosts, so mixed-version clients hide the unsupported entry.
    floatingWorkspaceEnabled: status.floatingWorkspaceEnabled === true,
    compatVerdict: evaluateMobileRuntimeCompat({
      // Why: prefer Yiru's runtime names while retaining the Mobile aliases for mixed-version hosts.
      desktopProtocolVersion: status.runtimeProtocolVersion ?? status.protocolVersion,
      desktopMinCompatibleMobileVersion:
        status.minCompatibleRuntimeClientVersion ?? status.minCompatibleMobileVersion
    })
  }
}

export function useHostStatusGates(args: {
  hostId: string | undefined
  client: RpcClient | null
  connState: ConnectionState
}): HostStatusGates {
  const { hostId, client, connState } = args
  const [loaded, setLoaded] = useState<LoadedHostStatusGates | null>(null)

  useEffect(() => {
    if (connState !== 'connected' || !client) {
      // Why: reconnecting the same host/client must revalidate gates instead of reviving its prior status.
      setLoaded(null)
      return
    }
    let cancelled = false
    const requestClient = client
    void (async () => {
      try {
        const response = await requestClient.sendRequest('status.get')
        if (cancelled || !response.ok) {
          return
        }
        const status = (response as RpcSuccess).result as DesktopStatus & {
          capabilities?: string[]
        }
        const gates = deriveHostStatusGates(status)
        setLoaded({
          hostId,
          client: requestClient,
          ...gates
        })
        if (gates.compatVerdict.kind === 'blocked') {
          console.warn('[protocol-compat] blocked', {
            reason: gates.compatVerdict.reason,
            desktopVersion: gates.compatVerdict.desktopVersion,
            requiredMobileVersion: gates.compatVerdict.requiredMobileVersion,
            requiredDesktopVersion: gates.compatVerdict.requiredDesktopVersion
          })
        }
      } catch {
        // Why: transport tear-down is not support evidence; the fail-closed return keeps gates hidden.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, connState, hostId])

  // Why: effects run after render, so key loaded gates by host and client during route reuse.
  if (
    connState !== 'connected' ||
    !client ||
    !loaded ||
    loaded.hostId !== hostId ||
    loaded.client !== client
  ) {
    return {
      hostCapabilities: undefined,
      floatingWorkspaceEnabled: false,
      compatVerdict: { kind: 'ok' }
    }
  }
  return {
    hostCapabilities: loaded.hostCapabilities,
    floatingWorkspaceEnabled: loaded.floatingWorkspaceEnabled,
    compatVerdict: loaded.compatVerdict
  }
}
