import { resolvePairingHostIdentity, saveHost } from './host-store'
import { connect, type ConnectOptions, type RpcClient } from './rpc-client'
import type { HostProfile, PairingOffer } from './types'

export type PreProfilePairingAttempt = {
  readonly result: Promise<{ hostId: string }>
  readonly timedOut: boolean
  dispose(): void
}

export function startPreProfilePairing(args: {
  offer: PairingOffer
  timeoutMs: number
  connectOptions?: ConnectOptions
}): PreProfilePairingAttempt {
  let disposed = false
  let timedOut = false
  let client: RpcClient | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const dispose = (): void => {
    if (disposed) {
      return
    }
    disposed = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    client?.close()
    client = null
  }

  timer = setTimeout(() => {
    timedOut = true
    dispose()
  }, args.timeoutMs)

  const result = runDirectPairing(
    args.offer,
    args.connectOptions,
    () => disposed,
    (next) => {
      client = next
    }
  )
    .catch((error: unknown) => {
      if (timedOut) {
        throw new Error('mobile pairing timed out')
      }
      throw error
    })
    .finally(dispose)

  return {
    result,
    get timedOut() {
      return timedOut
    },
    dispose
  }
}

async function runDirectPairing(
  offer: PairingOffer,
  connectOptions: ConnectOptions | undefined,
  isDisposed: () => boolean,
  setClient: (client: RpcClient) => void
): Promise<{ hostId: string }> {
  const now = Date.now()
  const { id: hostId, name } = await resolvePairingHostIdentity(offer.publicKeyB64, `host-${now}`)
  assertActive(isDisposed)

  const client = connect(offer.endpoint, offer.deviceToken, offer.publicKeyB64, connectOptions)
  setClient(client)
  await waitForConnected(client, isDisposed)
  assertActive(isDisposed)

  const host: HostProfile = {
    id: hostId,
    name,
    endpoint: offer.endpoint,
    deviceToken: offer.deviceToken,
    publicKeyB64: offer.publicKeyB64,
    lastConnected: now
  }
  await saveHost(host)
  return { hostId }
}

function waitForConnected(client: RpcClient, isDisposed: () => boolean): Promise<void> {
  if (client.getState() === 'connected') {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const unsubscribe = client.onStateChange((state) => {
      if (isDisposed()) {
        unsubscribe()
        reject(new Error('mobile pairing cancelled'))
      } else if (state === 'connected') {
        unsubscribe()
        resolve()
      } else if (state === 'auth-failed') {
        unsubscribe()
        reject(new Error('mobile pairing authentication failed'))
      }
    })
  })
}

function assertActive(isDisposed: () => boolean): void {
  if (isDisposed()) {
    throw new Error('mobile pairing cancelled')
  }
}
