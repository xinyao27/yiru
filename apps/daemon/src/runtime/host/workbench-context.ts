import { ORPCError } from '@orpc/server'
import type { TerminalMultiplexFrame } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { translateMain } from '~main/i18n/main-i18n'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import type { WorkspaceEventLog } from '../../events/log'
import { authenticatedTokenFingerprint } from '../rpc/orchestration-mutation-executor'
import { createRuntimeOrpcContext, type RuntimeOrpcContext } from '../rpc/orpc/bridge'
import { requestShellBrowserCommand } from '../rpc/orpc/shell-services-browser-client'
import { webShellServicesConnectionId } from '../rpc/orpc/shell-services-identity'
import type { TerminalMultiplexConnections } from '../terminal-multiplex/connections'

export type WorkbenchClientIdentity =
  | { kind: 'extension' }
  | {
      kind: 'mobile'
      deviceId: string
      deviceToken: string
      isAuthorized: () => boolean
    }

export type WorkbenchContextTransport = {
  bufferedBytes: () => number
  close: (code?: number, reason?: string) => void
  sendBinary: (payload: Uint8Array<ArrayBufferLike>) => boolean
}

export function createWorkbenchRuntimeContext(options: {
  connectionId: string
  identity: WorkbenchClientIdentity
  runtime: YiruRuntimeService
  terminalMultiplex: TerminalMultiplexConnections
  transport: WorkbenchContextTransport
  workspaceEventLog: WorkspaceEventLog
}): RuntimeOrpcContext {
  const { connectionId, identity, runtime, terminalMultiplex, transport } = options
  const isMobile = identity.kind === 'mobile'
  const principalId = isMobile ? identity.deviceId : 'local-extension'
  const shellConnectionId = isMobile ? undefined : webShellServicesConnectionId(connectionId)
  return {
    ...createRuntimeOrpcContext(runtime, {
      workspaceEventLog: options.workspaceEventLog,
      activateTerminalMultiplexEpoch: () =>
        terminalMultiplex.activateEpoch(connectionId, (code, reason) =>
          transport.close(code, reason)
        ),
      beforeInvocation: (invocation) => {
        if (
          terminalMultiplex.admitInvocation(
            connectionId,
            invocation.method,
            invocation.input,
            principalId,
            invocation.requestId
          ) === 'accepted'
        ) {
          return
        }
        throw new ORPCError('binary_terminal_stream_requires_dedicated_connection', {
          status: 409,
          message: translateMain(
            'runtimeHost.terminalMultiplexDedicatedConnection',
            'Terminal multiplex requires its own connection'
          )
        })
      },
      clientId: isMobile ? identity.deviceToken : `extension:${connectionId}`,
      clientKind: isMobile ? 'mobile' : 'runtime',
      closeTerminalMultiplexConnection: (code, reason) => transport.close(code, reason),
      connectionId,
      delegateBrowserCommand: (method, input) =>
        requestShellBrowserCommand(shellConnectionId, { input, method }),
      openTerminalMultiplex: (input) =>
        terminalMultiplex.issueTicket(
          principalId,
          input.clientInstanceId,
          input.environmentId,
          'extension-rpc'
        ),
      registerBinaryStreamHandler: (
        streamId: number,
        handler: (frame: TerminalMultiplexFrame) => void
      ) => terminalMultiplex.register(connectionId, streamId, handler),
      ...(isMobile
        ? {
            authenticatedCallerFingerprint: authenticatedTokenFingerprint(identity.deviceToken),
            principal: {
              deviceId: identity.deviceId,
              kind: 'paired-device' as const,
              scope: 'mobile' as const
            },
            resolveAdmission: () => {
              if (!identity.isAuthorized()) {
                throw new ORPCError('unauthorized', {
                  message: translateMain(
                    'runtimeHost.pairedDeviceUnauthorized',
                    'The paired device is no longer authorized'
                  ),
                  status: 401
                })
              }
              return {
                authenticatedCallerFingerprint: authenticatedTokenFingerprint(identity.deviceToken),
                principal: {
                  deviceId: identity.deviceId,
                  kind: 'paired-device' as const,
                  scope: 'mobile' as const
                }
              }
            }
          }
        : { resolveAdmission: () => ({}) }),
      sendBinary: transport.sendBinary,
      ...(shellConnectionId ? { shellConnectionId } : {}),
      terminalMultiplexQueueBytes: transport.bufferedBytes
    }),
    ...(isMobile
      ? { client: 'mobile' as const, deviceId: identity.deviceId }
      : { client: 'extension' as const })
  }
}
