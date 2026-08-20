import { z } from 'zod'

export const WEB_CONNECT_PROTOCOL_VERSION = 1
export const WEB_CONNECT_GRANT_TTL_MS = 10 * 60 * 1000
export const WEB_CONNECT_REQUEST_CLOCK_SKEW_MS = 60 * 1000
export const WEB_CONNECT_MAX_RELAY_FRAME_BYTES = 12 * 1024 * 1024

const Base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/)

export const BrowserSigningKeySchema = z
  .object({
    kty: z.literal('EC'),
    crv: z.literal('P-256'),
    x: Base64UrlSchema,
    y: Base64UrlSchema
  })
  .strict()

export const MachineSigningKeySchema = z
  .object({
    kty: z.literal('OKP'),
    crv: z.literal('Ed25519'),
    x: Base64UrlSchema
  })
  .strict()

export const BrowserIdentitySchema = z
  .object({
    signingKey: BrowserSigningKeySchema
  })
  .strict()

export const CreateConnectGrantRequestSchema = z
  .object({
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    browser: BrowserIdentitySchema
  })
  .strict()

export const CreateConnectGrantResponseSchema = z
  .object({
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    grant: z.string().regex(/^yrp_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
    grantId: Base64UrlSchema,
    expiresAt: z.number().int().positive()
  })
  .strict()

export const ExchangeConnectGrantRequestSchema = z
  .object({
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    secret: Base64UrlSchema,
    machine: z
      .object({
        name: z.string().trim().min(1).max(80),
        signingKey: MachineSigningKeySchema
      })
      .strict()
  })
  .strict()

export const ExchangeConnectGrantResponseSchema = z
  .object({
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    grantId: Base64UrlSchema,
    machineId: Base64UrlSchema,
    challenge: Base64UrlSchema,
    verificationCode: z.string().regex(/^\d{6}$/),
    expiresAt: z.number().int().positive(),
    browser: BrowserIdentitySchema
  })
  .strict()

export const ConfirmConnectGrantRequestSchema = z
  .object({
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    signature: Base64UrlSchema
  })
  .strict()

export const ConfirmConnectGrantResponseSchema = z
  .object({
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    machineId: Base64UrlSchema,
    browser: BrowserIdentitySchema
  })
  .strict()

export const BrowserGrantStatusRequestSchema = z
  .object({
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    timestamp: z.number().int().positive(),
    nonce: Base64UrlSchema,
    signature: Base64UrlSchema
  })
  .strict()

export const BrowserMachineTicketRequestSchema = BrowserGrantStatusRequestSchema
export const BrowserCancelGrantRequestSchema = BrowserGrantStatusRequestSchema

export const BrowserMachineTicketResponseSchema = z
  .object({
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    ticket: Base64UrlSchema,
    expiresAt: z.number().int().positive(),
    socketPath: z.string().regex(/^\/api\/connect\/machines\/[A-Za-z0-9_-]+\/socket$/),
    runtimePublicKeyB64: z.string().min(1)
  })
  .strict()

export const MachineRelayAuthSchema = z
  .object({
    type: z.literal('machine-auth'),
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    machineId: Base64UrlSchema,
    timestamp: z.number().int().positive(),
    nonce: Base64UrlSchema,
    runtimePublicKeyB64: z.string().min(1),
    signature: Base64UrlSchema
  })
  .strict()

export const RevokeBrowserAccessRequestSchema = z
  .object({
    actor: z.literal('machine'),
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    timestamp: z.number().int().positive(),
    nonce: Base64UrlSchema,
    signature: Base64UrlSchema
  })
  .strict()

export const BrowserSelfRevokeRequestSchema = z
  .object({
    actor: z.literal('browser'),
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    timestamp: z.number().int().positive(),
    nonce: Base64UrlSchema,
    signature: Base64UrlSchema
  })
  .strict()

export const BrowserRelayAuthSchema = z
  .object({
    type: z.literal('browser-auth'),
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    machineId: Base64UrlSchema,
    ticket: Base64UrlSchema,
    timestamp: z.number().int().positive(),
    nonce: Base64UrlSchema,
    e2eePublicKeyB64: z.string().min(1),
    signature: Base64UrlSchema
  })
  .strict()

export const MachineBrowserReadySchema = z
  .object({
    type: z.literal('relay-browser-ready'),
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    machineId: Base64UrlSchema,
    browserE2eePublicKeyB64: z.string().min(1),
    runtimePublicKeyB64: z.string().min(1),
    machineE2eePublicKeyB64: z.string().min(1),
    encryptedDeviceTokenB64: z.string().min(1),
    signature: Base64UrlSchema
  })
  .strict()

const GrantStatusBaseSchema = z.object({
  version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
  expiresAt: z.number().int().positive()
})

export const ConnectGrantStatusResponseSchema = z.discriminatedUnion('status', [
  GrantStatusBaseSchema.extend({ status: z.literal('waiting') }).strict(),
  GrantStatusBaseSchema.extend({
    status: z.literal('verification-required'),
    machineId: Base64UrlSchema,
    machineName: z.string().min(1),
    machineSigningKey: MachineSigningKeySchema,
    verificationCode: z.string().regex(/^\d{6}$/)
  }).strict(),
  GrantStatusBaseSchema.extend({
    status: z.literal('paired'),
    machineId: Base64UrlSchema,
    machineName: z.string().min(1),
    machineSigningKey: MachineSigningKeySchema
  }).strict(),
  GrantStatusBaseSchema.extend({ status: z.literal('expired') }).strict()
])

export type BrowserIdentity = z.infer<typeof BrowserIdentitySchema>
export type BrowserSigningKey = z.infer<typeof BrowserSigningKeySchema>
export type MachineSigningKey = z.infer<typeof MachineSigningKeySchema>
export type CreateConnectGrantRequest = z.infer<typeof CreateConnectGrantRequestSchema>
export type CreateConnectGrantResponse = z.infer<typeof CreateConnectGrantResponseSchema>
export type ExchangeConnectGrantRequest = z.infer<typeof ExchangeConnectGrantRequestSchema>
export type ExchangeConnectGrantResponse = z.infer<typeof ExchangeConnectGrantResponseSchema>
export type ConfirmConnectGrantRequest = z.infer<typeof ConfirmConnectGrantRequestSchema>
export type ConfirmConnectGrantResponse = z.infer<typeof ConfirmConnectGrantResponseSchema>
export type BrowserGrantStatusRequest = z.infer<typeof BrowserGrantStatusRequestSchema>
export type BrowserMachineTicketResponse = z.infer<typeof BrowserMachineTicketResponseSchema>
export type BrowserRelayAuth = z.infer<typeof BrowserRelayAuthSchema>
export type MachineRelayAuth = z.infer<typeof MachineRelayAuthSchema>
export type MachineBrowserReady = z.infer<typeof MachineBrowserReadySchema>
export type ConnectGrantStatusResponse = z.infer<typeof ConnectGrantStatusResponseSchema>

export function parseConnectGrant(value: string): { grantId: string; secret: string } | null {
  const match = /^yrp_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(value.trim())
  return match ? { grantId: match[1], secret: match[2] } : null
}
