import {
  encodeMobileE2EEV2Transcript,
  MobileE2EEV2HelloSchema,
  validateMobileE2EEV2Handshake,
  type MobileE2EEV2Ready
} from '@yiru/runtime-protocol/mobile/e2ee-contract'
import {
  openMobileE2EEV2Frame,
  sealMobileE2EEV2Frame
} from '@yiru/runtime-protocol/mobile/e2ee-framing'
import nacl from 'tweetnacl'

import { deriveMobileKeySchedule } from './key-schedule'

export class MobileE2EESession {
  private readonly desktopToMobileKey: Uint8Array
  private inboundCounter = 0n
  private readonly mobileToDesktopKey: Uint8Array
  private outboundCounter = 0n
  readonly ready: MobileE2EEV2Ready
  private readonly sessionId: Uint8Array
  readonly transcriptHashB64: string

  private constructor(
    ready: MobileE2EEV2Ready,
    transcriptHashB64: string,
    mobileToDesktopKey: Uint8Array,
    desktopToMobileKey: Uint8Array,
    sessionId: Uint8Array
  ) {
    this.ready = ready
    this.transcriptHashB64 = transcriptHashB64
    this.mobileToDesktopKey = mobileToDesktopKey
    this.desktopToMobileKey = desktopToMobileKey
    this.sessionId = sessionId
  }

  static create(helloValue: unknown, serverSecretKey: Uint8Array): MobileE2EESession | null {
    const parsed = MobileE2EEV2HelloSchema.safeParse(helloValue)
    if (!parsed.success || parsed.data.context.transport !== 'direct') {
      return null
    }
    const serverKeys = nacl.box.keyPair.fromSecretKey(serverSecretKey)
    const ready: MobileE2EEV2Ready = {
      clientNonceB64: parsed.data.clientNonceB64,
      context: parsed.data.context,
      desktopNonceB64: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'),
      desktopPublicKeyB64: Buffer.from(serverKeys.publicKey).toString('base64'),
      selection: { framing: 2, payloadKinds: ['text', 'binary'] },
      type: 'e2ee_ready',
      v: 2
    }
    const handshake = validateMobileE2EEV2Handshake(parsed.data, ready)
    if (!handshake) {
      return null
    }
    const sharedSecret = nacl.box.before(handshake.clientPublicKey, serverSecretKey)
    const schedule = deriveMobileKeySchedule({
      clientNonce: handshake.clientNonce,
      desktopNonce: handshake.desktopNonce,
      sharedSecret,
      transcript: encodeMobileE2EEV2Transcript(handshake)
    })
    return new MobileE2EESession(
      ready,
      Buffer.from(schedule.transcriptHash).toString('base64'),
      schedule.mobileToDesktopKey,
      schedule.desktopToMobileKey,
      schedule.sessionId
    )
  }

  openText(frameB64: string): string | null {
    const frame = decodeCanonicalBase64(frameB64)
    if (!frame) {
      return null
    }
    const plaintext = this.open(frame, 'text')
    return plaintext ? new TextDecoder().decode(plaintext) : null
  }

  openBinary(frame: Uint8Array): Uint8Array | null {
    return this.open(frame, 'binary')
  }

  sealText(plaintext: string): string {
    return Buffer.from(this.seal(new TextEncoder().encode(plaintext), 'text')).toString('base64')
  }

  sealBinary(plaintext: Uint8Array): Uint8Array {
    return this.seal(plaintext, 'binary')
  }

  private open(frame: Uint8Array, payloadKind: 'text' | 'binary'): Uint8Array | null {
    const plaintext = openMobileE2EEV2Frame({
      direction: 'mobile-to-desktop',
      expectedCounter: this.inboundCounter,
      frame,
      key: this.mobileToDesktopKey,
      payloadKind,
      sessionId: this.sessionId
    })
    if (plaintext) {
      this.inboundCounter++
    }
    return plaintext
  }

  private seal(plaintext: Uint8Array, payloadKind: 'text' | 'binary'): Uint8Array {
    const frame = sealMobileE2EEV2Frame({
      counter: this.outboundCounter,
      direction: 'desktop-to-mobile',
      key: this.desktopToMobileKey,
      payload: plaintext,
      payloadKind,
      sessionId: this.sessionId
    })
    this.outboundCounter++
    return frame
  }
}

function decodeCanonicalBase64(value: string): Uint8Array | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null
  }
  const bytes = Buffer.from(value, 'base64')
  return bytes.toString('base64') === value ? Uint8Array.from(bytes) : null
}
