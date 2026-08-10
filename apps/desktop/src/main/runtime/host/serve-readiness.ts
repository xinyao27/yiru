import type { RuntimeCapability } from '@yiru/runtime-protocol/capabilities'
import { translateMain } from '~main/i18n/main-i18n'

import type { NodeRuntimeHostMobilePairing } from './web-service'

type NodeRuntimeHostReadiness = {
  capabilities: readonly RuntimeCapability[]
  daemon: {
    agentHookEndpointFile: string
    agentHookPort: number
    endpoint: string
  }
  json: boolean
  mobilePairing: NodeRuntimeHostMobilePairing | null
  pairingFile: string
  runtimeId: string
  unixEndpoint: string
  webEndpoint: string
}

async function renderTerminalPairingQr(pairingUrl: string): Promise<string | null> {
  const QRCode = await import('qrcode')
  try {
    return await QRCode.toString(pairingUrl, { type: 'terminal', small: true })
  } catch {
    try {
      return await QRCode.toString(pairingUrl, { type: 'utf8' })
    } catch {
      return null
    }
  }
}

export async function printNodeRuntimeHostReadiness(
  readiness: NodeRuntimeHostReadiness
): Promise<void> {
  const pairingQr = readiness.mobilePairing
    ? await renderTerminalPairingQr(readiness.mobilePairing.pairingUrl)
    : null
  if (readiness.json) {
    console.log(
      JSON.stringify({
        type: 'yiru_runtime_ready',
        surface: 'portable-runtime',
        protocolVersion: 0,
        runtimeId: readiness.runtimeId,
        // Why: keep the established serve field on the phone/browser-facing transport.
        endpoint: readiness.webEndpoint,
        unixEndpoint: readiness.unixEndpoint,
        managedWslCliReconciliation: 'unsupported',
        pairing: readiness.mobilePairing
          ? {
              url: readiness.mobilePairing.pairingUrl,
              endpoint: readiness.mobilePairing.endpoint,
              deviceId: readiness.mobilePairing.deviceId,
              scope: 'mobile',
              qr: pairingQr
            }
          : null,
        web: {
          endpoint: readiness.webEndpoint,
          pairingFile: readiness.pairingFile
        },
        daemon: {
          endpoint: readiness.daemon.endpoint,
          agentHook: {
            port: readiness.daemon.agentHookPort,
            endpointFile: readiness.daemon.agentHookEndpointFile
          }
        },
        capabilities: readiness.capabilities
      })
    )
    return
  }
  console.log(
    `${translateMain('runtimeHost.ready', 'Yiru runtime host ready')}: ${readiness.webEndpoint}`
  )
  if (readiness.mobilePairing) {
    if (pairingQr) {
      console.log(
        `${translateMain('runtimeHost.mobilePairingQr', 'Mobile pairing QR')}:\n${pairingQr}`
      )
    }
    console.log(
      `${translateMain('runtimeHost.pairingUrl', 'Pairing URL')}: ${readiness.mobilePairing.pairingUrl}`
    )
  }
}
