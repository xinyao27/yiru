import { z } from 'zod'

import {
  BrowserIdentitySchema,
  BrowserRelayAuthSchema,
  WEB_CONNECT_MAX_RELAY_FRAME_BYTES,
  WEB_CONNECT_PROTOCOL_VERSION
} from './contracts'

const ConnectionIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/)

export const RelayBrowserAuthEnvelopeSchema = z
  .object({
    type: z.literal('relay-browser-auth'),
    connectionId: ConnectionIdSchema,
    auth: BrowserRelayAuthSchema,
    browser: BrowserIdentitySchema
  })
  .strict()

export const RelayOpaqueFrameSchema = z
  .object({
    type: z.literal('relay-frame'),
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    connectionId: ConnectionIdSchema,
    encoding: z.union([z.literal('text'), z.literal('base64url')]),
    payload: z.string()
  })
  .strict()

export const RelayConnectionCloseSchema = z
  .object({
    type: z.literal('relay-connection-close'),
    version: z.literal(WEB_CONNECT_PROTOCOL_VERSION),
    connectionId: ConnectionIdSchema
  })
  .strict()

export const WEB_CONNECT_MAX_TRANSPORT_FRAME_BYTES =
  Math.ceil((WEB_CONNECT_MAX_RELAY_FRAME_BYTES * 4) / 3) + 1024

export type RelayBrowserAuthEnvelope = z.infer<typeof RelayBrowserAuthEnvelopeSchema>
export type RelayOpaqueFrame = z.infer<typeof RelayOpaqueFrameSchema>
export type RelayConnectionClose = z.infer<typeof RelayConnectionCloseSchema>
