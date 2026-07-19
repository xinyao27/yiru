import { z } from 'zod'

import { defineMethod, defineStreamingMethod, type RpcContext } from '../core'

const clientIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9:._-]+$/)
const sessionIdSchema = z.string().uuid()
const configurationSchema = z.object({
  enabled: z.boolean(),
  command: z.string().min(1).max(32_768),
  args: z.array(z.string().max(16_384)).max(128),
  languageIds: z.array(z.string().min(1).max(64)).max(128)
})
const sessionParamsSchema = z.object({ clientId: clientIdSchema, sessionId: sessionIdSchema })

export const LANGUAGE_SERVER_METHODS = [
  defineMethod({
    name: 'languageServers.start',
    params: z.object({
      clientId: clientIdSchema,
      worktreeId: z.string().min(1).max(65_536),
      languageId: z.string().min(1).max(64),
      configuration: configurationSchema
    }),
    handler: (params, context) =>
      context.runtime
        .getLanguageServerManager()
        .start(languageServerOwner(context, params.clientId), params, params.configuration)
  }),
  defineMethod({
    name: 'languageServers.send',
    params: sessionParamsSchema.extend({
      message: z.object({ jsonrpc: z.literal('2.0') }).passthrough()
    }),
    handler: (params, context) =>
      context.runtime
        .getLanguageServerManager()
        .send(languageServerOwner(context, params.clientId), params)
  }),
  defineMethod({
    name: 'languageServers.stop',
    params: sessionParamsSchema,
    handler: (params, context) =>
      context.runtime
        .getLanguageServerManager()
        .stop(languageServerOwner(context, params.clientId), params.sessionId)
  }),
  defineMethod({
    name: 'languageServers.resolveDocumentUri',
    params: sessionParamsSchema.extend({ filePath: z.string().min(1).max(65_536) }),
    handler: (params, context) =>
      context.runtime
        .getLanguageServerManager()
        .resolveDocumentUri(languageServerOwner(context, params.clientId), params)
  }),
  defineMethod({
    name: 'languageServers.resolveLocation',
    params: sessionParamsSchema.extend({ uri: z.string().min(1).max(131_072) }),
    handler: (params, context) =>
      context.runtime
        .getLanguageServerManager()
        .resolveLocation(languageServerOwner(context, params.clientId), params)
  }),
  defineMethod({
    name: 'languageServers.getLogs',
    params: sessionParamsSchema,
    handler: (params, context) =>
      context.runtime
        .getLanguageServerManager()
        .getLogs(languageServerOwner(context, params.clientId), params.sessionId)
  }),
  defineStreamingMethod({
    name: 'languageServers.events.subscribe',
    params: z.object({ clientId: clientIdSchema }),
    handler: async (params, context, emit) => {
      const manager = context.runtime.getLanguageServerManager()
      const owner = languageServerOwner(context, params.clientId)
      const unsubscribe = manager.subscribeOwner(owner, emit)
      emit({ type: 'ready' })
      try {
        await waitForAbort(context.signal)
      } finally {
        unsubscribe()
        manager.releaseOwner(owner)
      }
    }
  })
]

function languageServerOwner(context: RpcContext, clientId: string): string {
  const principal = context.principal
  const principalId = !principal
    ? (context.clientId ?? 'anonymous')
    : principal.kind === 'paired-device'
      ? `${principal.kind}:${principal.deviceId}`
      : `${principal.kind}:${principal.connectionId}:${principal.channelKeyFingerprint}`
  // Why: the event stream can use a dedicated socket while requests use shared
  // control; authenticated principal + unguessable client id is the stable owner.
  return `runtime:${principalId}:${clientId}`
}

function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (!signal || signal.aborted) {
    return Promise.resolve()
  }
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
}
