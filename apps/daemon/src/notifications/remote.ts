import { hkdfSync } from 'node:crypto'

import type { AgentPhase } from '@yiru/runtime-protocol/contract'
import { getRepoIdFromWorktreeId } from '@yiru/runtime-protocol/model/workspace'

import type { WorkspaceEventLog } from '../events/log'
import { translate } from '../i18n/translate'
import type { MobileDevice, MobileDeviceStore } from '../mobile/devices'
import type { AgentPhaseChange } from './agent-phase'

const KEY_DOMAIN = 'yiru-apns-v1'
const MAX_PENDING_PUSHES = 256
const encoder = new TextEncoder()

type GatewayResult = { accepted: boolean; reason: string | null; retryable: boolean }

export class RemoteNotificationService {
  private readonly devices: MobileDeviceStore
  private readonly endpoint: string | null
  private readonly events: WorkspaceEventLog
  private readonly isDeviceConnected: (deviceId: string) => boolean
  private pending = 0
  private queue = Promise.resolve()
  private readonly token: string | null

  constructor(options: {
    devices: MobileDeviceStore
    endpoint?: string
    events: WorkspaceEventLog
    isDeviceConnected: (deviceId: string) => boolean
    token?: string
  }) {
    this.devices = options.devices
    this.endpoint = validateGatewayEndpoint(options.endpoint)
    this.events = options.events
    this.isDeviceConnected = options.isDeviceConnected
    this.token = options.token?.trim() || null
  }

  enqueue(input: AgentPhaseChange): void {
    if (!isRemotePhase(input.phase) || this.pending >= MAX_PENDING_PUSHES) {
      return
    }
    this.pending++
    this.queue = this.queue
      .then(() => this.publish(input))
      .catch((error: unknown) => {
        this.record(input, 'notification.apns.failed', {
          error: error instanceof Error ? error.message : 'unknown_error'
        })
      })
      .finally(() => {
        this.pending--
      })
  }

  async drain(): Promise<void> {
    await this.queue
  }

  private async publish(input: AgentPhaseChange): Promise<void> {
    const devices = this.devices
      .pushDevices()
      .filter((device) => !this.isDeviceConnected(device.id))
    if (devices.length === 0) {
      return
    }
    const endpoint = this.endpoint
    const token = this.token
    if (!endpoint || !token) {
      this.record(input, 'notification.apns.unavailable', { deviceCount: devices.length })
      return
    }
    for (const device of devices) {
      const result = await this.send(device, input, endpoint, token)
      if (
        !result.accepted &&
        ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(result.reason ?? '')
      ) {
        this.devices.registerPush(device.id, null)
      }
      this.record(
        input,
        result.accepted ? 'notification.apns.sent' : 'notification.apns.rejected',
        { deviceId: device.id, reason: result.reason }
      )
    }
  }

  private async send(
    device: MobileDevice,
    input: AgentPhaseChange,
    endpoint: string,
    token: string
  ): Promise<GatewayResult> {
    const request = await buildGatewayRequest(device, input)
    let result = await postGateway(endpoint, token, request)
    if (result.retryable) {
      await Bun.sleep(1_000)
      result = await postGateway(endpoint, token, request)
    }
    return result
  }

  private record(
    input: AgentPhaseChange,
    kind: string,
    detail: Record<string, number | string | null>
  ): void {
    this.events.append(getRepoIdFromWorktreeId(input.worktreeId), kind, {
      phase: input.phase,
      terminal: input.terminal,
      ...detail
    })
  }
}

async function buildGatewayRequest(device: MobileDevice, input: AgentPhaseChange) {
  if (!device.apnsToken || !device.apnsEnvironment) {
    throw new Error('mobile_push_registration_missing')
  }
  const keyId = keyIdentifier(device.token)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(notificationKey(device.token)).buffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )
  const plaintext = encoder.encode(
    JSON.stringify({
      body: input.title || translate('Open Yiru to review the agent session'),
      notificationId: input.terminal,
      title:
        input.phase === 'waiting-decision'
          ? translate('Yiru needs your decision')
          : translate('Yiru agent completed'),
      v: 1,
      worktreeId: input.worktreeId
    })
  )
  const ciphertext = await crypto.subtle.encrypt(
    {
      additionalData: encoder.encode(`${KEY_DOMAIN}\0${keyId}`),
      iv: nonce,
      name: 'AES-GCM'
    },
    key,
    plaintext
  )
  return {
    ciphertext: Buffer.from(ciphertext).toString('base64url'),
    collapseId: hashHex(`${input.terminal}\0${input.phase}`),
    deviceToken: device.apnsToken,
    environment: device.apnsEnvironment,
    keyId,
    nonce: Buffer.from(nonce).toString('base64url')
  }
}

async function postGateway(
  endpoint: string,
  token: string,
  body: Awaited<ReturnType<typeof buildGatewayRequest>>
): Promise<GatewayResult> {
  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify(body),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(10_000)
    })
    const value: unknown = await response.json()
    const accepted = readBoolean(value, 'accepted') ?? false
    return {
      accepted,
      reason: readString(value, 'reason'),
      retryable: readBoolean(value, 'retryable') ?? response.status >= 500
    }
  } catch {
    return { accepted: false, reason: 'gateway_unavailable', retryable: true }
  }
}

function notificationKey(token: string): Uint8Array {
  return new Uint8Array(
    hkdfSync(
      'sha256',
      encoder.encode(token),
      encoder.encode(`${KEY_DOMAIN}/salt`),
      encoder.encode('notification'),
      32
    )
  )
}

function keyIdentifier(token: string): string {
  return hashHex(`${KEY_DOMAIN}/key-id\0${token}`).slice(0, 32)
}

function hashHex(value: string): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex')
}

function readBoolean(value: unknown, key: string): boolean | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const entry = Reflect.get(value, key)
  return typeof entry === 'boolean' ? entry : null
}

function readString(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const entry = Reflect.get(value, key)
  return typeof entry === 'string' && entry.length <= 100 ? entry : null
}

function isRemotePhase(phase: AgentPhase): boolean {
  return phase === 'waiting-decision' || phase === 'complete'
}

function validateGatewayEndpoint(value?: string): string | null {
  if (!value) {
    return null
  }
  try {
    const url = new URL(value)
    const isLoopback = ['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
    return url.pathname === '/v1/push' && (url.protocol === 'https:' || isLoopback)
      ? url.href
      : null
  } catch {
    return null
  }
}
