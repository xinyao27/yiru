import {
  MOBILE_E2EE_V2_PROTOCOL,
  type MobileE2EEV2Hello,
  type MobileE2EEV2Ready
} from './mobile-e2ee-v2-contract'

function repeatedByteBase64(byte: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(32).fill(byte)))
}

export function createMobileE2EEV2Fixture(): {
  hello: MobileE2EEV2Hello
  ready: MobileE2EEV2Ready
  sharedSecret: Uint8Array
} {
  const context = {
    protocol: MOBILE_E2EE_V2_PROTOCOL,
    initiator: 'mobile' as const,
    responder: 'desktop' as const,
    transport: 'relay' as const,
    relayHostId: 'AbCdEf0123_-xyZ9'
  } as const
  return {
    hello: {
      type: 'e2ee_hello',
      v: 2,
      clientPublicKeyB64: repeatedByteBase64(1),
      clientNonceB64: repeatedByteBase64(2),
      capabilities: { framing: [2], payloadKinds: ['text', 'binary'] },
      context
    },
    ready: {
      type: 'e2ee_ready',
      v: 2,
      desktopPublicKeyB64: repeatedByteBase64(3),
      clientNonceB64: repeatedByteBase64(2),
      desktopNonceB64: repeatedByteBase64(4),
      selection: { framing: 2, payloadKinds: ['text', 'binary'] },
      context
    },
    sharedSecret: new Uint8Array(32).fill(5)
  }
}

export const MOBILE_E2EE_V2_VECTOR = {
  transcriptLength: 1347,
  transcriptHashHex: 'f28356175c4aa1d2ffb1e73315f8a10fbe56f529583b438d6bf37fb2c2839385',
  mobileToDesktopKeyHex: '8dfc57b994765217e06098d4cb0af846ca9c7cdd0c95b80ec1a5d0152d7adc95',
  desktopToMobileKeyHex: 'edeb06aa8777b24f1c1c62cc874d98cbbc426e3e79edcb2bf812e220d1808e02',
  sessionIdHex: '5a0412d9fb1d0d94a62aa1fa78e3b2b043e52d6d1dc3e715ec228bbb81055412'
} as const
