import { randomBytes } from 'node:crypto'

import type { WebSocket } from 'ws'
import { getCoworkingResourceQuota } from '~shared/coworking/resource-limits'
import { RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY } from '~shared/runtime-orpc-socket'

import type { DeviceEntry, DeviceRegistry } from '../device-registry'
import type { E2EEKeypair } from '../e2ee-keypair'
import { E2EEChannel, type E2EEAuthenticatedDevice } from './e2ee-channel'

type MobileSocketPayload = string | Uint8Array<ArrayBufferLike>

export type MobileSocketTransport = {
  onMessage(
    handler: (
      message: MobileSocketPayload,
      reply: (response: string) => void,
      ws: WebSocket
    ) => void
  ): void
  onConnectionClose(
    handler: (clientId: string | null, ws: WebSocket, hasOtherConnections: boolean) => void
  ): void
  setClientId(ws: WebSocket, clientId: string): void
  terminateClientConnections(clientId: string): number
}

export type AuthenticatedMobileSocket = {
  ws: WebSocket
  connectionId: string
  device: E2EEAuthenticatedDevice
  sendText: (plaintext: string) => boolean
  sendBinary: (plaintext: Uint8Array<ArrayBufferLike>) => boolean
}

type MobileSocketWiringOptions = {
  deviceRegistry: DeviceRegistry
  e2eeKeypair: E2EEKeypair
  getRuntimeId: () => string
  onText: (
    socket: AuthenticatedMobileSocket,
    plaintext: string,
    reply: (response: string) => void,
    sendBinary: (response: Uint8Array<ArrayBufferLike>) => boolean | void
  ) => void
  onBinary: (socket: AuthenticatedMobileSocket, bytes: Uint8Array<ArrayBufferLike>) => void
  onClose: (socket: AuthenticatedMobileSocket | null, hasOtherConnections: boolean) => void
}

function toAuthenticatedDevice(device: DeviceEntry): E2EEAuthenticatedDevice {
  return {
    deviceId: device.deviceId,
    deviceToken: device.token,
    scope: device.scope
  }
}

export class MobileSocketWiring {
  private readonly deviceRegistry: DeviceRegistry
  private readonly e2eeKeypair: E2EEKeypair
  private readonly getRuntimeId: () => string
  private readonly onText: MobileSocketWiringOptions['onText']
  private readonly onBinary: MobileSocketWiringOptions['onBinary']
  private readonly onClose: MobileSocketWiringOptions['onClose']
  private readonly channels = new Map<WebSocket, E2EEChannel>()
  private readonly connectionIds = new Map<WebSocket, string>()
  private readonly authenticatedSockets = new Map<WebSocket, AuthenticatedMobileSocket>()
  private readonly transports = new Set<MobileSocketTransport>()

  constructor(options: MobileSocketWiringOptions) {
    this.deviceRegistry = options.deviceRegistry
    this.e2eeKeypair = options.e2eeKeypair
    this.getRuntimeId = options.getRuntimeId
    this.onText = options.onText
    this.onBinary = options.onBinary
    this.onClose = options.onClose
  }

  attachTransport(transport: MobileSocketTransport): void {
    this.transports.add(transport)
    transport.onMessage((message, _reply, ws) => {
      this.handleRawMessage(transport, ws, message)
    })
    transport.onConnectionClose((_clientId, ws) => this.handleClose(ws))
  }

  getConnectionId(ws: WebSocket): string | undefined {
    return this.connectionIds.get(ws)
  }

  get channelCount(): number {
    return this.channels.size
  }

  get connectionCount(): number {
    return this.connectionIds.size
  }

  terminateDeviceConnections(deviceToken: string): number {
    let terminated = 0
    for (const transport of this.transports) {
      terminated += transport.terminateClientConnections(deviceToken)
    }
    return terminated
  }

  private handleRawMessage(
    transport: MobileSocketTransport,
    ws: WebSocket,
    message: MobileSocketPayload
  ): void {
    let channel = this.channels.get(ws)
    if (!channel) {
      const connectionId = randomBytes(8).toString('hex')
      this.connectionIds.set(ws, connectionId)
      channel = new E2EEChannel(ws, {
        serverSecretKey: this.e2eeKeypair.secretKey,
        authenticatedCapabilities: [RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY],
        authenticatedRuntimeId: this.getRuntimeId(),
        resolveAuthenticatedDevice: (token) => {
          const device = this.deviceRegistry.validateToken(token)
          if (!device) {
            return null
          }
          return toAuthenticatedDevice(device)
        },
        onReady: (_channel, device) => {
          if (!this.canAdmitDeviceConnection(device)) {
            throw new Error('coworking_grant_connection_quota_exceeded')
          }
          const socket = {
            ws,
            connectionId,
            device,
            sendText: (plaintext: string) => channel?.sendText(plaintext) ?? false,
            sendBinary: (plaintext: Uint8Array<ArrayBufferLike>) =>
              channel?.sendBinary(plaintext) ?? false
          }
          this.authenticatedSockets.set(ws, socket)
          transport.setClientId(ws, device.deviceToken)
          this.deviceRegistry.updateLastSeen(device.deviceId)
        },
        onError: (code, reason) => {
          this.channels.get(ws)?.destroy()
          this.channels.delete(ws)
          ws.close(code, reason)
        }
      })
      channel.onMessage((plaintext, reply, sendBinary) => {
        const socket = this.authenticatedSockets.get(ws)
        if (socket) {
          this.onText(socket, plaintext, reply, sendBinary)
        }
      })
      channel.onBinaryMessage((bytes) => {
        const socket = this.authenticatedSockets.get(ws)
        if (socket) {
          this.onBinary(socket, bytes)
        }
      })
      this.channels.set(ws, channel)
    }
    channel.handleRawMessage(message)
  }

  private handleClose(ws: WebSocket): void {
    const socket = this.authenticatedSockets.get(ws) ?? null
    this.authenticatedSockets.delete(ws)
    this.channels.get(ws)?.destroy()
    this.channels.delete(ws)
    this.connectionIds.delete(ws)
    const hasOtherConnections =
      socket !== null &&
      Array.from(this.authenticatedSockets.values()).some(
        (candidate) => candidate.device.deviceToken === socket.device.deviceToken
      )
    this.onClose(socket, hasOtherConnections)
  }

  private canAdmitDeviceConnection(device: E2EEAuthenticatedDevice): boolean {
    if (device.scope !== 'coworking-host') {
      return true
    }
    const grant = this.deviceRegistry.getDevice(device.deviceId)
    if (grant?.scope !== 'coworking-host') {
      return false
    }
    const quota = getCoworkingResourceQuota('host', grant.tier)
    const activeForGrant = Array.from(this.authenticatedSockets.values()).filter(
      (socket) => socket.device.deviceId === device.deviceId
    ).length
    return activeForGrant < quota.maxConnectionsPerSubject
  }
}
