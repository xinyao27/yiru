import { withRemoteRuntimeTailscaleHint } from '@yiru/runtime-protocol/tailscale-endpoint'
import { connectRemoteRuntimeSharedControlOrpcTunnel } from '~main/runtime/environment-request-connections'
import { supportsRuntimeOrpcTunnel } from '~main/runtime/environment-shared-control'
import type {
  RemoteRuntimeOrpcTunnel,
  SharedControlOrpcTunnelCallbacks
} from '~shared/remote-runtime/shared-control-types'
import { resolveEnvironment } from '~shared/runtime-environment-store'
import { getPreferredPairingOffer } from '~shared/runtime-environments'

export class RuntimeEnvironmentOrpcBridgeError extends Error {
  readonly code: 'unsupported' | 'unavailable'

  constructor(code: 'unsupported' | 'unavailable', message: string) {
    super(message)
    this.name = 'RuntimeEnvironmentOrpcBridgeError'
    this.code = code
  }
}

export async function connectRuntimeEnvironmentOrpcBridge(args: {
  userDataPath: string
  ownerId: string
  environmentId: string
  timeoutMs: number
  callbacks: SharedControlOrpcTunnelCallbacks
}): Promise<RemoteRuntimeOrpcTunnel> {
  let endpoint: string | null = null
  try {
    const environment = resolveEnvironment(args.userDataPath, args.environmentId)
    const pairing = getPreferredPairingOffer(environment)
    endpoint = pairing.endpoint
    const supported = await supportsRuntimeOrpcTunnel(
      args.userDataPath,
      environment,
      pairing,
      args.timeoutMs
    )
    if (!supported) {
      throw new RuntimeEnvironmentOrpcBridgeError(
        'unsupported',
        'The paired runtime does not support the encrypted oRPC tunnel.'
      )
    }
    return await connectRemoteRuntimeSharedControlOrpcTunnel(
      environment.id,
      pairing,
      args.ownerId,
      args.timeoutMs,
      {
        ...args.callbacks,
        formatCloseError: (error) => runtimeOrpcTunnelError(error, pairing.endpoint)
      }
    )
  } catch (error) {
    if (error instanceof RuntimeEnvironmentOrpcBridgeError) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new RuntimeEnvironmentOrpcBridgeError(
      'unavailable',
      endpoint ? withRemoteRuntimeTailscaleHint(message, endpoint) : message
    )
  }
}

function runtimeOrpcTunnelError(error: Error, endpoint: string): Error {
  const hinted = new Error(withRemoteRuntimeTailscaleHint(error.message, endpoint))
  hinted.name = error.name
  return hinted
}
