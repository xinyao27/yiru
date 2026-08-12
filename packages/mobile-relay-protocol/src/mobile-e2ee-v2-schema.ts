import { z } from 'zod'

import { MOBILE_E2EE_V2_PROTOCOL } from './mobile-e2ee-v2-domains'

const Base64Bytes32Schema = z
  .string()
  .regex(/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/)
  .refine((value) => {
    try {
      const decoded = atob(value)
      return decoded.length === 32 && btoa(decoded) === value
    } catch {
      return false
    }
  }, 'Expected canonical base64 for 32 bytes')

const DirectContextSchema = z
  .object({
    protocol: z.literal(MOBILE_E2EE_V2_PROTOCOL),
    initiator: z.literal('mobile'),
    responder: z.literal('desktop'),
    transport: z.literal('direct')
  })
  .strict()

const RelayContextSchema = z
  .object({
    protocol: z.literal(MOBILE_E2EE_V2_PROTOCOL),
    initiator: z.literal('mobile'),
    responder: z.literal('desktop'),
    transport: z.literal('relay'),
    relayHostId: z.string().regex(/^[A-Za-z0-9_-]{16}$/)
  })
  .strict()

export const MobileE2EEV2ContextSchema = z.discriminatedUnion('transport', [
  DirectContextSchema,
  RelayContextSchema
])

export const MobileE2EEV2HelloSchema = z
  .object({
    type: z.literal('e2ee_hello'),
    v: z.literal(2),
    clientPublicKeyB64: Base64Bytes32Schema,
    clientNonceB64: Base64Bytes32Schema,
    capabilities: z
      .object({
        framing: z.tuple([z.literal(2)]),
        payloadKinds: z.tuple([z.literal('text'), z.literal('binary')])
      })
      .strict(),
    context: MobileE2EEV2ContextSchema
  })
  .strict()

export const MobileE2EEV2ReadySchema = z
  .object({
    type: z.literal('e2ee_ready'),
    v: z.literal(2),
    desktopPublicKeyB64: Base64Bytes32Schema,
    clientNonceB64: Base64Bytes32Schema,
    desktopNonceB64: Base64Bytes32Schema,
    selection: z
      .object({
        framing: z.literal(2),
        payloadKinds: z.tuple([z.literal('text'), z.literal('binary')])
      })
      .strict(),
    context: MobileE2EEV2ContextSchema
  })
  .strict()

export type MobileE2EEV2Context = z.infer<typeof MobileE2EEV2ContextSchema>
export type MobileE2EEV2Hello = z.infer<typeof MobileE2EEV2HelloSchema>
export type MobileE2EEV2Ready = z.infer<typeof MobileE2EEV2ReadySchema>
