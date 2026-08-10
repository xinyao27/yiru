import {
  evaluateMobileRuntimeCompat,
  type MobileRuntimeCompatVerdict
} from '@yiru/runtime-protocol/capabilities'
import { useEffect, useState } from 'react'

import type { DesktopStatus } from '../transport/host-rpc-types'
import type { RpcClient } from './rpc-client'
import { callRuntimeOrpc } from './runtime-orpc-client'
import type { ConnectionState } from './types'

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

// Why: a host that predates `rpc.orpc.v1` can't parse the oRPC-framed call
// at all, so the oRPC status.get below would otherwise hang forever with no
// error and no compat verdict. Bound it, then fall back to the bare-envelope
// probe every host has always answered (rpc-client-status-probe.ts) so the
// "update Yiru on the host" screen still renders instead of a silent stall.
const ORPC_STATUS_PROBE_TIMEOUT_MS = 4_000

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
        let status: DesktopStatus & { capabilities?: string[] }
        try {
          status = await callRuntimeOrpc(
            requestClient,
            (runtime) => runtime.status.get,
            undefined,
            {
              timeoutMs: ORPC_STATUS_PROBE_TIMEOUT_MS
            }
          )
        } catch {
          const fallback = await requestClient.probeStatusForProtocolCompat()
          if (cancelled) {
            return
          }
          if (!fallback) {
            throw new Error('status.get unavailable over oRPC and bare envelope')
          }
          status = fallback
        }
        if (cancelled) {
          return
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
