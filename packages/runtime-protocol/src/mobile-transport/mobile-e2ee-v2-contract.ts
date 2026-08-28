import { MOBILE_E2EE_V2_TRANSCRIPT_DOMAIN } from './mobile-e2ee-v2-domains'
import {
  MobileE2EEV2HelloSchema,
  MobileE2EEV2ReadySchema,
  type MobileE2EEV2Context,
  type MobileE2EEV2Hello,
  type MobileE2EEV2Ready
} from './mobile-e2ee-v2-schema'

export {
  MOBILE_E2EE_V2_KDF_DOMAIN,
  MOBILE_E2EE_V2_PROTOCOL,
  MOBILE_E2EE_V2_TRANSCRIPT_DOMAIN
} from './mobile-e2ee-v2-domains'

export type MobileE2EETransport = 'direct'
export type MobileE2EEPayloadKind = 'text' | 'binary'

export {
  MobileE2EEV2ContextSchema,
  MobileE2EEV2HelloSchema,
  MobileE2EEV2ReadySchema,
  type MobileE2EEV2Context,
  type MobileE2EEV2Hello,
  type MobileE2EEV2Ready
} from './mobile-e2ee-v2-schema'

export type MobileE2EEV2Handshake = {
  hello: MobileE2EEV2Hello
  ready: MobileE2EEV2Ready
  clientPublicKey: Uint8Array
  desktopPublicKey: Uint8Array
  clientNonce: Uint8Array
  desktopNonce: Uint8Array
}

export function validateMobileE2EEV2Handshake(
  helloValue: unknown,
  readyValue: unknown
): MobileE2EEV2Handshake | null {
  const helloResult = MobileE2EEV2HelloSchema.safeParse(helloValue)
  const readyResult = MobileE2EEV2ReadySchema.safeParse(readyValue)
  if (!helloResult.success || !readyResult.success) {
    return null
  }
  const hello = helloResult.data
  const ready = readyResult.data
  if (!contextsEqual(hello.context, ready.context)) {
    return null
  }
  if (ready.clientNonceB64 !== hello.clientNonceB64) {
    return null
  }

  const clientPublicKey = decodeCanonicalBase64Bytes(hello.clientPublicKeyB64, 32)
  const desktopPublicKey = decodeCanonicalBase64Bytes(ready.desktopPublicKeyB64, 32)
  const clientNonce = decodeCanonicalBase64Bytes(hello.clientNonceB64, 32)
  const desktopNonce = decodeCanonicalBase64Bytes(ready.desktopNonceB64, 32)
  if (!clientPublicKey || !desktopPublicKey || !clientNonce || !desktopNonce) {
    return null
  }

  return {
    hello,
    ready,
    clientPublicKey,
    desktopPublicKey,
    clientNonce,
    desktopNonce
  }
}

export function encodeMobileE2EEV2Transcript(handshake: MobileE2EEV2Handshake): Uint8Array {
  const { hello, ready } = handshake
  const fields: [string, Uint8Array][] = [
    ['domain', utf8(MOBILE_E2EE_V2_TRANSCRIPT_DOMAIN)],
    ['mobile-to-desktop.type', utf8(hello.type)],
    ['mobile-to-desktop.version', uint32(hello.v)],
    ['mobile-to-desktop.client-public-key', handshake.clientPublicKey],
    ['mobile-to-desktop.client-nonce', handshake.clientNonce],
    ['mobile-to-desktop.capabilities.framing', encodeNumberList(hello.capabilities.framing)],
    [
      'mobile-to-desktop.capabilities.payload-kinds',
      encodeStringList(hello.capabilities.payloadKinds)
    ],
    ['mobile-to-desktop.context.protocol', utf8(hello.context.protocol)],
    ['mobile-to-desktop.context.initiator', utf8(hello.context.initiator)],
    ['mobile-to-desktop.context.responder', utf8(hello.context.responder)],
    ['mobile-to-desktop.context.transport', utf8(hello.context.transport)],
    ['desktop-to-mobile.type', utf8(ready.type)],
    ['desktop-to-mobile.version', uint32(ready.v)],
    ['desktop-to-mobile.desktop-public-key', handshake.desktopPublicKey],
    ['desktop-to-mobile.client-nonce-echo', handshake.clientNonce],
    ['desktop-to-mobile.desktop-nonce', handshake.desktopNonce],
    ['desktop-to-mobile.selection.framing', uint32(ready.selection.framing)],
    ['desktop-to-mobile.selection.payload-kinds', encodeStringList(ready.selection.payloadKinds)],
    ['desktop-to-mobile.context.protocol', utf8(ready.context.protocol)],
    ['desktop-to-mobile.context.initiator', utf8(ready.context.initiator)],
    ['desktop-to-mobile.context.responder', utf8(ready.context.responder)],
    ['desktop-to-mobile.context.transport', utf8(ready.context.transport)]
  ]
  return concatBytes(
    fields.map(([name, value]) =>
      concatBytes([uint32(utf8(name).length), utf8(name), uint32(value.length), value])
    )
  )
}

function contextsEqual(left: MobileE2EEV2Context, right: MobileE2EEV2Context): boolean {
  return (
    left.protocol === right.protocol &&
    left.initiator === right.initiator &&
    left.responder === right.responder &&
    left.transport === right.transport
  )
}

function decodeCanonicalBase64Bytes(value: unknown, length: number): Uint8Array | null {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return null
  }
  try {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return bytes.length === length && encodeBase64(bytes) === value ? bytes : null
  } catch {
    return null
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function encodeNumberList(values: readonly number[]): Uint8Array {
  return concatBytes([uint32(values.length), ...values.map(uint32)])
}

function encodeStringList(values: readonly string[]): Uint8Array {
  return concatBytes([
    uint32(values.length),
    ...values.map((value) => {
      const bytes = utf8(value)
      return concatBytes([uint32(bytes.length), bytes])
    })
  ])
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, false)
  return bytes
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
