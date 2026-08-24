// Why: this is the single security boundary for the bundled CLI. It owns
// auth-token enforcement, bootstrap-metadata publication, and transport
// orchestration so a running runtime is always discoverable via exactly
// one on-disk file. Method handling lives in `rpc/` and transport specifics
// live in `rpc/unix-socket-transport.ts` and `rpc/ws-transport.ts`.
import { randomBytes } from 'node:crypto'

import type {
  MobileDevelopmentPairingInput,
  MobileDevelopmentPairingResult
} from '@yiru/runtime-protocol/mobile-development-pairing'
import type { WebSocket } from 'ws'
import type {
  CoworkingHostAccessTier,
  CoworkingHostDeviceView
} from '~shared/coworking/host-access-contract'
import { encodePairingOffer, PAIRING_OFFER_VERSION, type PairingOffer } from '~shared/pairing'
import type { RuntimeTransportMetadata } from '~shared/runtime-bootstrap'
import type { DeviceScope } from '~shared/runtime-types'

import type { CoworkingGrantJournal } from '../coworking/grant-journal'
import type { CoworkingHostDeviceEntry, DeviceRegistry } from './device-registry'
import type { E2EEKeypair } from './e2ee-keypair'
import { RuntimeLoopbackServer } from './loopback/server'
import type { RpcResponse } from './rpc/core'
import { RpcDispatcher } from './rpc/dispatcher'
import { ALL_RPC_METHODS } from './rpc/methods'
import type { MobileSocketWiring } from './rpc/mobile-socket-wiring'
import { runtimeOrpcRouter } from './rpc/orpc/router'
import type { RpcTransport } from './rpc/transport'
import { TerminalMultiplexConnections } from './terminal-multiplex/connections'
import type { YiruRuntimeService } from './yiru-runtime'

const DEFAULT_WS_PORT = 6768

export type YiruRuntimeRpcServerOptions = {
  runtime: YiruRuntimeService
  userDataPath: string
  pid?: number
  platform?: NodeJS.Platform
  enableWebSocket?: boolean
  wsPort?: number
  // Why: true when the caller set an explicit port (e.g. `yiru serve --port`).
  // Distinguishes that pin from the DEFAULT_WS_PORT default so transport bind
  // order can prefer the pin over a stale STA-1511 fallback (issue #8535).
  preferPinnedWsPort?: boolean
  enableDevelopmentMobilePairing?: boolean
  webClientRoot?: string
}

type PairingCredentialPolicy = 'reuse-pending' | 'rotate-pending' | 'reuse-named'

// Why: long-poll slot cap. With keepalives a `check --wait --timeout-ms
// 600000` can hold a connection for up to 10 minutes; unbounded that would
// saturate MAX_RUNTIME_RPC_CONNECTIONS (32) with 32 waiting coordinators
// and lock out normal short RPCs. Capping at half the connection budget
// leaves the other half for short traffic. On overflow the server responds
// immediately with `runtime_busy` (CLI exit 75) — fail fast, not silent
// queuing. See design doc §3.1 + §7 risk #2.
export const LONG_POLL_CAP = 16

function resolvePairingEndpoint(rawEndpoint: string, address: string | null | undefined): string {
  const endpoint = new URL(rawEndpoint)
  const override = address?.trim()
  if (!override) {
    endpoint.hostname = '127.0.0.1'
    return formatWebSocketUrl(endpoint)
  }
  if (/^wss?:\/\//i.test(override)) {
    return formatWebSocketUrl(new URL(override))
  }
  const parsed = parsePairingAddressOverride(override)
  endpoint.hostname = parsed.host.includes(':')
    ? `[${parsed.host.replace(/^\[|\]$/g, '')}]`
    : parsed.host
  if (parsed.port) {
    endpoint.port = parsed.port
  }
  return formatWebSocketUrl(endpoint)
}

function parsePairingAddressOverride(address: string): { host: string; port: string | null } {
  if (address.startsWith('[') || address.split(':').length === 2) {
    try {
      const parsed = new URL(`ws://${address}`)
      return { host: parsed.hostname.replace(/^\[|\]$/g, ''), port: parsed.port || null }
    } catch {
      return { host: address, port: null }
    }
  }
  return { host: address, port: null }
}

function formatWebSocketUrl(url: URL): string {
  const formatted = url.toString()
  return url.pathname === '/' && !url.search && !url.hash ? formatted.replace(/\/$/, '') : formatted
}

// Why: stamp the authenticated connection's scope onto the status.get success
// envelope. status.get has no per-connection context inside the dispatcher, so
// the scope is added here at the transport boundary where the device is known.
// Failures fall back to the untouched reply rather than dropping the response.
export function injectDeviceScope(response: string, scope: DeviceScope): string {
  try {
    const parsed = JSON.parse(response) as RpcResponse
    if (parsed.ok !== true || typeof parsed.result !== 'object' || parsed.result === null) {
      return response
    }
    ;(parsed.result as Record<string, unknown>).deviceScope = scope
    return JSON.stringify(parsed)
  } catch {
    return response
  }
}

export abstract class RuntimeRpcPairingServer {
  protected readonly runtime: YiruRuntimeService
  protected readonly dispatcher: RpcDispatcher
  protected readonly userDataPath: string
  protected readonly pid: number
  protected readonly platform: NodeJS.Platform
  protected readonly enableWebSocket: boolean
  protected readonly wsPort: number
  protected readonly preferPinnedWsPort: boolean
  protected readonly enableDevelopmentMobilePairing: boolean
  protected readonly webClientRoot: string | undefined
  protected readonly authToken = randomBytes(24).toString('hex')
  protected deviceRegistry: DeviceRegistry | null = null
  protected e2eeKeypair: E2EEKeypair | null = null
  protected tlsFingerprint: string | null = null
  protected activeTransports: RpcTransport[] = []
  protected transports: RuntimeTransportMetadata[] = []
  protected mobileSocketWiring: MobileSocketWiring | null = null
  protected readonly terminalMultiplex = new TerminalMultiplexConnections()
  protected readonly runtimeLoopback: RuntimeLoopbackServer
  protected readonly wsDispatchAbortStates = new Map<
    WebSocket,
    {
      controllers: Set<AbortController>
      requests: Map<string, AbortController>
      abortOnClose: () => void
    }
  >()
  // Why: separate from Node's server.maxConnections because we need to count
  // only long-running dispatches, not every in-flight short RPC. See §3.1 +
  // §7 risk #2.
  protected activeLongPolls = 0
  protected grantJournal: Pick<CoworkingGrantJournal, 'recordHostOperation'> | null = null

  protected abstract createDevelopmentMobilePairing(
    params: MobileDevelopmentPairingInput
  ): MobileDevelopmentPairingResult

  constructor({
    runtime,
    userDataPath,
    pid = process.pid,
    platform = process.platform,
    enableWebSocket = false,
    wsPort = DEFAULT_WS_PORT,
    preferPinnedWsPort = false,
    enableDevelopmentMobilePairing = false,
    webClientRoot
  }: YiruRuntimeRpcServerOptions) {
    this.runtime = runtime
    this.runtimeLoopback = new RuntimeLoopbackServer({
      runtime,
      router: runtimeOrpcRouter,
      connections: this.terminalMultiplex,
      userDataPath,
      // Why: docs/reference/terminal-multiplex.md §21.1 makes these preferences part of
      // plaintext admission. create-main-window.ts fixes all three to true.
      browserSecurity: { contextIsolation: true, sandbox: true, webSecurity: true }
    })
    this.dispatcher = new RpcDispatcher({
      runtime,
      methods: ALL_RPC_METHODS,
      mobileDevelopmentPairing: (params) => this.createDevelopmentMobilePairing(params)
    })
    this.userDataPath = userDataPath
    this.pid = pid
    this.platform = platform
    this.enableWebSocket = enableWebSocket
    this.wsPort = wsPort
    this.preferPinnedWsPort = preferPinnedWsPort
    this.enableDevelopmentMobilePairing = enableDevelopmentMobilePairing
    this.webClientRoot = webClientRoot
  }

  getDeviceRegistry(): DeviceRegistry | null {
    return this.deviceRegistry
  }

  setGrantJournal(journal: Pick<CoworkingGrantJournal, 'recordHostOperation'>): void {
    this.grantJournal = journal
  }

  getTlsFingerprint(): string | null {
    return this.tlsFingerprint
  }

  getE2EEPublicKey(): string | null {
    return this.e2eeKeypair?.publicKeyB64 ?? null
  }

  getE2EEKeypair(): E2EEKeypair | null {
    return this.e2eeKeypair
  }

  getMobileSocketWiring(): MobileSocketWiring | null {
    return this.mobileSocketWiring
  }

  getRendererLoopbackCredentials(
    webContentsId: number,
    rendererUrl: string
  ): Promise<{ endpoint: string; processToken: Uint8Array<ArrayBuffer> }> {
    return this.runtimeLoopback.credentialsForRenderer(webContentsId, rendererUrl)
  }

  async revokeMobileDevice(deviceId: string): Promise<boolean> {
    const device = this.deviceRegistry?.getDevice(deviceId)
    if (device?.scope !== 'mobile') {
      return false
    }
    if (!this.deviceRegistry?.removeDevice(deviceId)) {
      return false
    }
    this.mobileSocketWiring?.terminateDeviceConnections(device.token)
    return true
  }

  // Why: the web-connect relay bridge streams browser traffic into this very
  // transport, so the browser lands on the same runtime as the desktop window
  // instead of a second runtime host started beside it.
  createWebConnectTarget(name: string): {
    deviceToken: string
    endpoint: string
    runtimePublicKeyB64: string
  } | null {
    const endpoint = this.getWebSocketEndpoint()
    const publicKeyB64 = this.getE2EEPublicKey()
    if (!endpoint || !publicKeyB64 || !this.deviceRegistry) {
      return null
    }
    return {
      deviceToken: this.deviceRegistry.addRuntimeDevice(name).token,
      endpoint,
      runtimePublicKeyB64: publicKeyB64
    }
  }

  createCoworkingHostPairingOffer(args: {
    name: string
    subject: { nodeId: string; userDisplayName: string }
    hostScopeKey: string
    tier: CoworkingHostAccessTier
    expiresAt: number
  }): PairingOffer {
    const endpoint = this.getWebSocketEndpoint()
    const publicKeyB64 = this.getE2EEPublicKey()
    if (!endpoint || !publicKeyB64 || !this.deviceRegistry) {
      throw new Error('coworking_host_pairing_unavailable')
    }
    const device = this.deviceRegistry.addCoworkingHostDevice(args)
    return {
      v: PAIRING_OFFER_VERSION,
      endpoint,
      deviceToken: device.token,
      publicKeyB64,
      scope: 'runtime'
    }
  }

  listCoworkingHostDevices(): readonly CoworkingHostDeviceView[] {
    return (this.deviceRegistry?.listDevices() ?? [])
      .filter((device): device is CoworkingHostDeviceEntry => device.scope === 'coworking-host')
      .sort((a, b) => b.pairedAt - a.pairedAt)
      .map((device) => ({
        deviceId: device.deviceId,
        name: device.name,
        pairedAt: device.pairedAt,
        lastSeenAt: device.lastSeenAt > 0 ? device.lastSeenAt : null,
        subject: device.subject,
        tier: device.tier,
        expiresAt: device.expiresAt,
        revokedAt: device.revokedAt
      }))
  }

  revokeCoworkingHostDevice(deviceId: string): boolean {
    const device = this.deviceRegistry?.getDevice(deviceId)
    if (device?.scope !== 'coworking-host' || !this.deviceRegistry?.revokeDevice(deviceId)) {
      return false
    }
    for (const subjectDevice of this.deviceRegistry.listDevices()) {
      if (
        subjectDevice.scope === 'coworking-host' &&
        subjectDevice.subject.nodeId === device.subject.nodeId
      ) {
        this.mobileSocketWiring?.terminateDeviceConnections(subjectDevice.token)
      }
    }
    return true
  }

  getWebSocketEndpoint(): string | null {
    const ws = this.transports.find((t) => t.kind === 'websocket')
    return ws?.endpoint ?? null
  }

  createMobilePairingOffer(args: {
    address?: string | null
    name?: string
    credentialPolicy?: PairingCredentialPolicy
  }):
    | { available: false }
    | {
        available: true
        pairingUrl: string
        endpoint: string
        deviceId: string
      } {
    const rawEndpoint = this.getWebSocketEndpoint()
    const publicKeyB64 = this.getE2EEPublicKey()
    if (!rawEndpoint || !this.deviceRegistry || !publicKeyB64) {
      return { available: false }
    }

    const endpoint = resolvePairingEndpoint(rawEndpoint, args.address)
    const deviceName = args.name ?? `Mobile ${new Date().toLocaleDateString()}`
    const credentialPolicy = args.credentialPolicy ?? 'reuse-pending'
    const device =
      credentialPolicy === 'reuse-named'
        ? this.deviceRegistry.getOrCreateNamedDevice(deviceName)
        : credentialPolicy === 'rotate-pending'
          ? this.deviceRegistry.rotatePendingDevice(deviceName)
          : this.deviceRegistry.getOrCreatePendingDevice(deviceName)
    const pairingUrl = encodePairingOffer({
      v: PAIRING_OFFER_VERSION,
      endpoint,
      deviceToken: device.token,
      publicKeyB64,
      scope: 'mobile'
    })
    return {
      available: true,
      pairingUrl,
      endpoint,
      deviceId: device.deviceId
    }
  }
}
