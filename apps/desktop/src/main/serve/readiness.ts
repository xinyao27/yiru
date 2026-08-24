import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

import type { YiruRuntimeRpcServer } from '../runtime/rpc'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'

export type ServeOptions = {
  json: boolean
  wsPort?: number
  pairingAddress: string | null
  mobilePairing: boolean
}

export function getServeOptions(argv = process.argv): ServeOptions {
  const valueAfter = (flag: string): string | null => {
    const index = argv.indexOf(flag)
    if (index === -1) {
      return null
    }
    const value = argv[index + 1]
    return value && !value.startsWith('--') ? value : null
  }
  const rawPort = valueAfter('--serve-port')
  let wsPort: number | undefined
  if (rawPort) {
    const parsedPort = Number(rawPort)
    if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
      throw new Error(`Invalid --serve-port value: ${rawPort}`)
    }
    wsPort = parsedPort
  }
  return {
    json: argv.includes('--serve-json'),
    ...(wsPort !== undefined ? { wsPort } : {}),
    pairingAddress: valueAfter('--serve-pairing-address'),
    mobilePairing: argv.includes('--serve-mobile-pairing')
  }
}

export function getBundledWebClientRoot(): string | undefined {
  const root = join(app.getAppPath(), 'out', 'web')
  return existsSync(join(root, 'web-index.html')) ? root : undefined
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

export async function printServeReady(
  options: ServeOptions,
  context: {
    runtime: YiruRuntimeService | null
    runtimeRpc: YiruRuntimeRpcServer | null
    managedWslCliReconciliation: 'pending' | 'settled' | 'failed'
  }
): Promise<void> {
  if (!context.runtime || !context.runtimeRpc) {
    throw new Error('Runtime host must be initialized before printing serve readiness')
  }
  const endpoint = context.runtimeRpc.getWebSocketEndpoint()
  const pairing = options.mobilePairing
    ? context.runtimeRpc.createMobilePairingOffer({
        address: options.pairingAddress,
        name: `Mobile ${new Date().toLocaleDateString()}`
      })
    : ({ available: false } as const)
  const pairingQr = pairing.available ? await renderTerminalPairingQr(pairing.pairingUrl) : null
  if (options.json) {
    console.log(
      JSON.stringify({
        type: 'yiru_runtime_ready',
        runtimeId: context.runtime.getRuntimeId(),
        endpoint,
        managedWslCliReconciliation: context.managedWslCliReconciliation,
        pairing: pairing.available
          ? {
              url: pairing.pairingUrl,
              endpoint: pairing.endpoint,
              deviceId: pairing.deviceId,
              scope: 'mobile',
              qr: pairingQr
            }
          : null
      })
    )
    return
  }
  console.log(`Yiru runtime host ready: ${endpoint ?? 'websocket unavailable'}`)
  if (pairing.available) {
    if (pairingQr) {
      console.log(`Mobile pairing QR:\n${pairingQr}`)
    }
    console.log(`Pairing URL: ${pairing.pairingUrl}`)
  }
}

export function installServeSignalHandlers(): void {
  const quit = (): void => app.quit()
  process.once('SIGINT', quit)
  process.once('SIGTERM', quit)
}
