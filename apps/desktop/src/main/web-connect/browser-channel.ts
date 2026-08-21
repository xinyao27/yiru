import { createPublicKey, sign, verify } from 'node:crypto'

import {
  WEB_CONNECT_REQUEST_CLOCK_SKEW_MS,
  WEB_CONNECT_PROTOCOL_VERSION,
  type MachineBrowserReady
} from '@yiru/runtime-protocol/web-connect'
import type { RelayBrowserAuthEnvelope } from '@yiru/runtime-protocol/web-connect/relay-frames'
import {
  browserRelayAuthSigningMessage,
  machineBrowserReadySigningMessage
} from '@yiru/runtime-protocol/web-connect/signing-messages'
import nacl from 'tweetnacl'
import { WebSocket, type RawData } from 'ws'

import type { ConnectIdentityStore, MachineIdentity } from './identity'

type BrowserChannelCallbacks = {
  onClose: () => void
  sendFrame: (data: Buffer, isBinary: boolean) => void
  sendReady: (ready: MachineBrowserReady) => void
}

export type BrowserChannelRequest = {
  callbacks: BrowserChannelCallbacks
  deviceToken: string
  envelope: RelayBrowserAuthEnvelope
  identity: MachineIdentity
  localEndpoint: string
  runtimePublicKeyB64: string
  store: ConnectIdentityStore
}

export function openBrowserChannel(request: BrowserChannelRequest): WebSocket | null {
  const { callbacks, deviceToken, envelope, identity, localEndpoint, runtimePublicKeyB64, store } =
    request
  const authorized = store
    .listPairedBrowserAccess()
    .find(
      (candidate) =>
        candidate.machineId === envelope.auth.machineId &&
        candidate.browser.signingKey.x === envelope.browser.signingKey.x &&
        candidate.browser.signingKey.y === envelope.browser.signingKey.y
    )
  if (
    !authorized ||
    Math.abs(Date.now() - envelope.auth.timestamp) > WEB_CONNECT_REQUEST_CLOCK_SKEW_MS ||
    !verifyBrowserAuth(envelope) ||
    !store.consumeBrowserRelayNonce({
      machineId: envelope.auth.machineId,
      browser: envelope.browser,
      nonce: envelope.auth.nonce
    })
  ) {
    return null
  }
  const local = new WebSocket(localEndpoint)
  local.on('open', () => {
    callbacks.sendReady(
      createMachineReady({ envelope, deviceToken, runtimePublicKeyB64, identity })
    )
    local.send(JSON.stringify({ type: 'e2ee_hello', publicKeyB64: envelope.auth.e2eePublicKeyB64 }))
  })
  local.on('message', (data, isBinary) => callbacks.sendFrame(relayDataBuffer(data), isBinary))
  local.on('close', callbacks.onClose)
  local.on('error', () => {})
  return local
}

function createMachineReady(args: {
  envelope: RelayBrowserAuthEnvelope
  deviceToken: string
  runtimePublicKeyB64: string
  identity: MachineIdentity
}): MachineBrowserReady {
  const machineKeys = nacl.box.keyPair()
  const browserKey = Buffer.from(args.envelope.auth.e2eePublicKeyB64, 'base64')
  const sharedKey = nacl.box.before(browserKey, machineKeys.secretKey)
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box.after(Buffer.from(args.deviceToken), nonce, sharedKey)
  const encryptedDeviceTokenB64 = Buffer.concat([
    Buffer.from(nonce),
    Buffer.from(ciphertext)
  ]).toString('base64')
  const unsigned = {
    machineId: args.envelope.auth.machineId,
    browserE2eePublicKeyB64: args.envelope.auth.e2eePublicKeyB64,
    runtimePublicKeyB64: args.runtimePublicKeyB64,
    machineE2eePublicKeyB64: Buffer.from(machineKeys.publicKey).toString('base64'),
    encryptedDeviceTokenB64
  }
  return {
    type: 'relay-browser-ready',
    version: WEB_CONNECT_PROTOCOL_VERSION,
    ...unsigned,
    signature: sign(
      null,
      Buffer.from(machineBrowserReadySigningMessage(unsigned)),
      args.identity.privateKey
    ).toString('base64url')
  }
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
