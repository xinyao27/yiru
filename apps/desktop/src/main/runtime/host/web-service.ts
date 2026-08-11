import { existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { translateMain } from '~main/i18n/main-i18n'
import { encodePairingOffer, PAIRING_OFFER_VERSION } from '~shared/pairing'
import { writeSecureJsonFile } from '~shared/secure-file'

import { DeviceRegistry } from '../device-registry'
import { loadOrCreateE2EEKeypair } from '../e2ee-keypair'
import type { RpcContext } from '../rpc/core'
import { MobileSocketWiring } from '../rpc/mobile-socket-wiring'
import { RuntimeOrpcWsHandler } from '../rpc/orpc/ws-handler'
import { readWsFallbackPort, writeWsFallbackPort } from '../rpc/ws-fallback-port-store'
import { WebSocketTransport } from '../rpc/ws-transport'
import { TerminalMultiplexConnections } from '../terminal-multiplex/connections'
import type { YiruRuntimeService } from '../yiru-runtime'
import { createNodeRuntimeHostCoworkingDevices } from './coworking-devices'
import { createNodeRuntimeHostMobilePairing, resolveMobilePairingEndpoint } from './mobile-pairing'
import { nodeRuntimeHostOrpcHandlerHooks } from './procedure-availability'
import { nodeRuntimeHostRouter } from './router'

type NodeRuntimeHostWebServiceOptions = {
  deviceName: string
  mobilePairing: boolean
  pairingAddress: string | null
  port: number
  preferPinnedPort: boolean
  runtime: YiruRuntimeService
  userDataPath: string
}

export type NodeRuntimeHostMobilePairing = {
  deviceId: string
  endpoint: string
  pairingUrl: string
}

export type NodeRuntimeHostWebService = {
  coworkingRuntimeRpc: ReturnType<typeof createNodeRuntimeHostCoworkingDevices>
  createDevelopmentMobilePairing: NonNullable<RpcContext['mobileDevelopmentPairing']>
  endpoint: string
  mobilePairing: NodeRuntimeHostMobilePairing | null
  pairingFile: string
  shutdown: () => Promise<void>
}

export async function startNodeRuntimeHostWebService({
  deviceName,
  mobilePairing,
  pairingAddress,
  port,
  preferPinnedPort,
  runtime,
  userDataPath
}: NodeRuntimeHostWebServiceOptions): Promise<NodeRuntimeHostWebService> {
  const deviceRegistry = new DeviceRegistry(userDataPath)
  const e2eeKeypair = loadOrCreateE2EEKeypair(userDataPath)
  const mobileDevice = mobilePairing
    ? deviceRegistry.getOrCreatePendingDevice(
        translateMain('runtimeHost.mobileClient', 'Mobile runtime client')
      )
    : null
  // Why: mint the persisted mobile credential first. Runtime credentials are
  // process-scoped and must never be included in the registry save it triggers.
  const device = deviceRegistry.addRuntimeDevice(deviceName)
  const transport = new WebSocketTransport({
    // Why: coworking rewrites a credentialed pairing offer to the approved
    // Tailscale address. Its control endpoint must therefore be reachable even
    // when the optional mobile-pairing presentation is disabled.
    host: '0.0.0.0',
    port,
    fallbackPort: readWsFallbackPort(userDataPath),
    preferPinnedPort,
    staticRoot: findWebClientRoot()
  })
  const terminalMultiplex = new TerminalMultiplexConnections()
  let resolvedEndpoint = ''
  const orpc = new RuntimeOrpcWsHandler({
    runtime,
    router: nodeRuntimeHostRouter,
    handlerHooks: nodeRuntimeHostOrpcHandlerHooks,
    resolveAdmission: (socket) => {
      const current = deviceRegistry.validateToken(socket.device.deviceToken)
      if (!current || current.deviceId !== socket.device.deviceId) {
        return null
      }
      return {
        principal: {
          kind: 'paired-device',
          deviceId: current.deviceId,
          scope: current.scope
        }
      }
    },
    beforeInvocation: (socket, invocation) => {
      const current = deviceRegistry.validateToken(socket.device.deviceToken)
      if (!current || current.deviceId !== socket.device.deviceId) {
        return {
          denial: {
            code: 'unauthorized',
            status: 401,
            message: translateMain(
              'runtimeHost.pairedDeviceUnauthorized',
              'The paired device is no longer authorized'
            )
          }
        }
      }
      const admission = terminalMultiplex.admitInvocation(
        socket.connectionId,
        invocation.method,
        invocation.input,
        socket.device.deviceId,
        invocation.requestId
      )
      if (admission !== 'accepted') {
        return {
          denial: {
            code: 'binary_terminal_stream_requires_dedicated_connection',
            status: 409,
            message: translateMain(
              'runtimeHost.terminalMultiplexDedicatedConnection',
              'Terminal multiplex requires its own connection'
            )
          }
        }
      }
      return undefined
    },
    // Why: multiplex stream handlers stay scoped to the authenticated physical
    // connection that invoked the procedure; connection admission above prevents
    // that socket from carrying shared control procedures before or after it.
    registerBinaryStreamHandler: (connectionId, streamId, handler) =>
      terminalMultiplex.register(connectionId, streamId, handler),
    openTerminalMultiplex: (socket, input) =>
      terminalMultiplex.issueTicket(
        socket.device.deviceId,
        input.clientInstanceId,
        input.environmentId,
        resolveMobilePairingEndpoint(resolvedEndpoint, pairingAddress)
      ),
    activateTerminalMultiplexEpoch: (socket) =>
      terminalMultiplex.activateEpoch(socket.connectionId, (code, reason) =>
        socket.ws.close(code, reason)
      )
  })
  const wiring = new MobileSocketWiring({
    deviceRegistry,
    e2eeKeypair,
    getRuntimeId: () => runtime.getRuntimeId(),
    onText: (socket, plaintext) => {
      if (!orpc.handleText(socket, plaintext)) {
        socket.ws.close(1003)
      }
    },
    onBinary: (socket, bytes) => {
      const current = deviceRegistry.validateToken(socket.device.deviceToken)
      if (!current || current.deviceId !== socket.device.deviceId) {
        socket.ws.close(
          4001,
          translateMain(
            'runtimeHost.pairedDeviceUnauthorized',
            'The paired device is no longer authorized'
          )
        )
        return
      }
      if (orpc.handleBinary(socket, bytes)) {
        return
      }
      if (terminalMultiplex.handle(socket.connectionId, bytes)) {
        return
      }
      socket.ws.close(
        1003,
        translateMain(
          'runtimeHost.invalidBinaryStream',
          'The runtime host received an invalid binary stream'
        )
      )
    },
    onClose: (socket) => {
      if (!socket) {
        return
      }
      orpc.close(socket)
      terminalMultiplex.closeConnection(socket.connectionId)
      runtime.cleanupSubscriptionsForConnection(socket.connectionId)
    }
  })
  wiring.attachTransport(transport)

  const hostDirectory = join(userDataPath, 'rh', String(process.pid))
  const pairingFile = join(hostDirectory, 'web-pairing.json')
  let resolvedMobilePairing: NodeRuntimeHostMobilePairing | null = null
  try {
    await transport.start()
    if (port !== 0 && transport.resolvedPort !== port) {
      writeWsFallbackPort(userDataPath, transport.resolvedPort)
    }
    resolvedEndpoint = `ws://127.0.0.1:${transport.resolvedPort}`
    writeSecureJsonFile(pairingFile, {
      pairingUrl: encodePairingOffer({
        v: PAIRING_OFFER_VERSION,
        endpoint: resolvedEndpoint,
        deviceToken: device.token,
        publicKeyB64: e2eeKeypair.publicKeyB64,
        scope: 'runtime'
      })
    })
    if (mobileDevice) {
      const endpoint = resolveMobilePairingEndpoint(resolvedEndpoint, pairingAddress)
      resolvedMobilePairing = {
        deviceId: mobileDevice.deviceId,
        endpoint,
        pairingUrl: encodePairingOffer({
          v: PAIRING_OFFER_VERSION,
          endpoint,
          deviceToken: mobileDevice.token,
          publicKeyB64: e2eeKeypair.publicKeyB64,
          scope: 'mobile'
        })
      }
    }
  } catch (error) {
    await transport.stop().catch(() => {})
    deviceRegistry.removeDevice(device.deviceId)
    rmSync(pairingFile, { force: true })
    throw error
  }

  const mobilePairingServices = createNodeRuntimeHostMobilePairing({
    defaultDeviceName: translateMain('runtimeHost.mobileClient', 'Mobile runtime client'),
    deviceRegistry,
    getEndpoint: () => resolvedEndpoint || null,
    publicKeyB64: e2eeKeypair.publicKeyB64,
    runtimeUnavailableMessage: translateMain(
      'runtimeHost.mobileWebSocketUnavailable',
      'Mobile WebSocket transport is unavailable'
    ),
    terminateDeviceConnections: (deviceToken) => wiring.terminateDeviceConnections(deviceToken)
  })
  const uninstallMobileHostPairingBridge = mobilePairingServices.installBridge()

  let hasStopped = false
  return {
    coworkingRuntimeRpc: createNodeRuntimeHostCoworkingDevices({
      deviceRegistry,
      getEndpoint: () => resolvedEndpoint || null,
      publicKeyB64: e2eeKeypair.publicKeyB64,
      wiring
    }),
    createDevelopmentMobilePairing: mobilePairingServices.createDevelopmentPairing,
    endpoint: resolvedEndpoint,
    mobilePairing: resolvedMobilePairing,
    pairingFile,
    shutdown: async () => {
      if (hasStopped) {
        return
      }
      hasStopped = true
      uninstallMobileHostPairingBridge()
      try {
        await transport.stop()
      } finally {
        deviceRegistry.removeDevice(device.deviceId)
        rmSync(pairingFile, { force: true })
      }
    }
  }
}

function findWebClientRoot(): string | undefined {
  const configuredRoot = process.env.YIRU_WEB_CLIENT_ROOT
  const candidates = [
    configuredRoot ? resolve(configuredRoot) : null,
    resolve(dirname(process.argv[1] ?? ''), '..', 'web'),
    resolve(process.cwd(), 'apps', 'desktop', 'out', 'web'),
    resolve(process.cwd(), 'out', 'web')
  ]
  return candidates.find(
    (candidate): candidate is string =>
      candidate !== null && existsSync(join(candidate, 'web-index.html'))
  )
}
