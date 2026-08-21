import { randomBytes } from 'node:crypto'
import { hostname } from 'node:os'

import type {
  ShellWebConnectPendingVerification,
  ShellWebConnectState,
  ShellWebConnectStatus
} from '@yiru/runtime-protocol/contract'
import { RuntimeClientError } from '~shared/runtime-client-error'

import { connectOrigin } from './connect-origin'
import { confirmConnectGrant, exchangeConnectGrant } from './grant-client'
import { createConnectIdentityStore, type ConnectIdentityStore } from './identity'
import { startRelayBridge, type LocalRuntimeTarget, type RelayBridge } from './relay-bridge'

// Why: the renderer reads this exact shape off the shell contract, so reusing the
// contract types here is what keeps the two from drifting apart.
export type WebConnectState = ShellWebConnectState
export type WebConnectStatus = ShellWebConnectStatus
export type WebConnectPendingVerification = ShellWebConnectPendingVerification

export type LocalRuntimeTargetResolver = (name: string) => LocalRuntimeTarget | null

export type WebConnectServiceOptions = {
  onStatusChange: (status: WebConnectStatus) => void
  resolveTarget: LocalRuntimeTargetResolver
  userDataPath: string
}

type PendingPairing = {
  exchanged: Awaited<ReturnType<typeof exchangeConnectGrant>>
  machineName: string
}

// Why: a browser session the app itself opened is round-tripped through a nonce
// the app minted, so that loop can be confirmed without asking the user to
// compare a code. Any grant arriving without a live nonce is an unsolicited
// pairing attempt and still has to be confirmed against the visible code.
const DESKTOP_NONCE_TTL_MS = 5 * 60_000
const RUNTIME_DEVICE_NAME = 'Yiru Web'

export class WebConnectService {
  private bridge: RelayBridge | null = null
  private readonly desktopNonces = new Map<string, number>()
  private online = false
  private pending: PendingPairing | null = null
  private readonly options: WebConnectServiceOptions
  private readonly store: ConnectIdentityStore

  constructor(options: WebConnectServiceOptions) {
    this.options = options
    this.store = createConnectIdentityStore(options.userDataPath)
  }

  getStatus(): WebConnectStatus {
    const access = this.store.listPairedBrowserAccess()
    return {
      browserUrl: `${connectOrigin()}/connect`,
      machineId: access[0]?.machineId ?? null,
      pairedBrowsers: access.length,
      pendingVerification: this.pending
        ? {
            expiresAt: this.pending.exchanged.expiresAt,
            machineName: this.pending.machineName,
            verificationCode: this.pending.exchanged.verificationCode
          }
        : null,
      state: this.resolveState()
    }
  }

  // Why: pairing is browser-initiated by design — the browser's signing key is
  // non-exportable, so the app cannot mint a grant for it. The app instead opens
  // the connect page carrying a nonce and waits for the page to hand a grant back
  // through the deep link.
  createBrowserSessionUrl(): string {
    this.pruneDesktopNonces()
    const nonce = randomBytes(24).toString('base64url')
    this.desktopNonces.set(nonce, Date.now() + DESKTOP_NONCE_TTL_MS)
    return `${connectOrigin()}/connect#desktop=${nonce}`
  }

  async handleDeepLink(link: { desktopNonce: string | null; grant: string }): Promise<void> {
    const identity = this.store.loadOrCreateMachineIdentity()
    const machineName = hostname()
    const exchanged = await exchangeConnectGrant({
      grant: link.grant,
      machineName,
      machineKey: identity.publicKey
    })
    if (link.desktopNonce && this.consumeDesktopNonce(link.desktopNonce)) {
      await this.completePairing({ exchanged, machineName })
      return
    }
    this.pending = { exchanged, machineName }
    this.publishStatus()
  }

  async confirmPendingVerification(): Promise<void> {
    const pending = this.pending
    if (!pending) {
      throw new RuntimeClientError(
        'connect_no_pending_pairing',
        'There is no pairing request waiting for confirmation.'
      )
    }
    await this.completePairing(pending)
  }

  cancelPendingVerification(): void {
    this.pending = null
    this.publishStatus()
  }

  // Why: an already-paired machine should be reachable as soon as the app is
  // running, without making the user re-run anything.
  connect(): void {
    if (this.bridge) {
      return
    }
    const machineId = this.store.listPairedBrowserAccess()[0]?.machineId
    if (!machineId) {
      return
    }
    const target = this.options.resolveTarget(RUNTIME_DEVICE_NAME)
    if (!target) {
      return
    }
    this.bridge = startRelayBridge({
      identity: this.store.loadOrCreateMachineIdentity(),
      machineId,
      store: this.store,
      target,
      onOnline: () => {
        this.online = true
        this.publishStatus()
      },
      onOffline: () => {
        this.online = false
        this.publishStatus()
      }
    })
    this.publishStatus()
  }

  disconnect(): void {
    this.bridge?.stop()
    this.bridge = null
    this.online = false
    this.publishStatus()
  }

  private async completePairing(pending: PendingPairing): Promise<void> {
    const identity = this.store.loadOrCreateMachineIdentity()
    const confirmed = await confirmConnectGrant(pending.exchanged, identity)
    this.store.savePairedBrowserAccess({
      machineId: confirmed.machineId,
      browser: confirmed.browser,
      pairedAt: Date.now(),
      usedRelayNonces: []
    })
    this.pending = null
    // Why: the newly paired browser is already waiting on the relay, so the
    // bridge has to be rebuilt against the new machine id rather than reused.
    this.disconnect()
    this.connect()
  }

  private resolveState(): WebConnectState {
    if (this.pending) {
      return 'pairing'
    }
    if (!this.bridge) {
      return 'offline'
    }
    return this.online ? 'online' : 'connecting'
  }

  private consumeDesktopNonce(nonce: string): boolean {
    this.pruneDesktopNonces()
    const expiresAt = this.desktopNonces.get(nonce)
    if (expiresAt === undefined) {
      return false
    }
    this.desktopNonces.delete(nonce)
    return expiresAt > Date.now()
  }

  private pruneDesktopNonces(): void {
    const now = Date.now()
    for (const [nonce, expiresAt] of this.desktopNonces) {
      if (expiresAt <= now) {
        this.desktopNonces.delete(nonce)
      }
    }
  }

  private publishStatus(): void {
    this.options.onStatusChange(this.getStatus())
  }
}
