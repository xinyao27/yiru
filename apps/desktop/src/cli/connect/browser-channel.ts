import { createPublicKey, verify } from 'node:crypto'

import {
  WEB_CONNECT_REQUEST_CLOCK_SKEW_MS,
  browserRelayAuthSigningMessage
} from '@yiru/runtime-protocol/web-connect'
import type { RelayBrowserAuthEnvelope } from '@yiru/runtime-protocol/web-connect/relay-frames'
import { WebSocket, type RawData } from 'ws'

import { consumeBrowserRelayNonce, type PairedBrowserAccess } from './identity'

type BrowserChannelCallbacks = {
  onClose: () => void
  sendFrame: (data: Buffer, isBinary: boolean) => void
  sendReady: (deviceToken: string) => void
}

export function openBrowserChannel(
  envelope: RelayBrowserAuthEnvelope,
  access: PairedBrowserAccess[],
  localEndpoint: string,
  deviceToken: string,
  callbacks: BrowserChannelCallbacks
): WebSocket | null {
  const authorized = access.find(
    (candidate) =>
      candidate.machineId === envelope.auth.machineId &&
      candidate.browser.signingKey.x === envelope.browser.signingKey.x &&
      candidate.browser.signingKey.y === envelope.browser.signingKey.y
  )
  if (
    !authorized ||
    Math.abs(Date.now() - envelope.auth.timestamp) > WEB_CONNECT_REQUEST_CLOCK_SKEW_MS ||
    !verifyBrowserAuth(envelope) ||
    !consumeBrowserRelayNonce({
      machineId: envelope.auth.machineId,
      browser: envelope.browser,
      nonce: envelope.auth.nonce
    })
  ) {
    return null
  }
  const local = new WebSocket(localEndpoint)
  local.on('open', () => {
    callbacks.sendReady(deviceToken)
    local.send(JSON.stringify({ type: 'e2ee_hello', publicKeyB64: envelope.auth.e2eePublicKeyB64 }))
  })
  local.on('message', (data, isBinary) => callbacks.sendFrame(relayDataBuffer(data), isBinary))
  local.on('close', callbacks.onClose)
  local.on('error', () => {})
  return local
}

function relayDataBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data)
  }
  return Buffer.isBuffer(data) ? data : Buffer.from(data)
}

function verifyBrowserAuth(envelope: RelayBrowserAuthEnvelope): boolean {
  const key = createPublicKey({ key: envelope.browser.signingKey, format: 'jwk' })
  return verify(
    'sha256',
    Buffer.from(browserRelayAuthSigningMessage(envelope.auth)),
    { key, dsaEncoding: 'ieee-p1363' },
    Buffer.from(envelope.auth.signature, 'base64url')
  )
}
