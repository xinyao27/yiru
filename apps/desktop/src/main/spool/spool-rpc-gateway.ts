import type { ZodType } from 'zod'

import type { AuthenticatedSpoolPrincipal } from '../../shared/rpc-principal'
import { SpoolGatewayConnection } from './spool-rpc-server-connection'

export { SpoolRpcError } from './spool-rpc-error'

export type SpoolMethodAccess = 'catalog-read' | 'worktree-read' | 'worktree-control'

export type BoundSpoolInvocation = {
  value: unknown
  isCurrent: () => boolean
  subscribeInvalidation?: (listener: () => void) => () => void
}

export type SpoolRpcInvocationContext = {
  principal: AuthenticatedSpoolPrincipal
  requestId: string
  signal: AbortSignal
}

export type SpoolRpcMethodSpec = {
  name: string
  schema: ZodType
  access: SpoolMethodAccess
  streaming?: boolean
  bind: (
    params: unknown,
    context: SpoolRpcInvocationContext
  ) => Promise<BoundSpoolInvocation> | BoundSpoolInvocation
  execute: (bound: unknown, context: SpoolRpcInvocationContext) => Promise<unknown> | unknown
  project: (result: unknown) => unknown
}

export type SpoolRpcRegistry = ReadonlyMap<string, SpoolRpcMethodSpec>

export type SpoolConnectionTransport = {
  sendJson: (frame: string, streamKey?: string) => void
  close: (code: number, reason: string) => void
}

export type SpoolServerConnection = {
  dispatchJson(frame: string): void
  dispatchBinary(frame: Uint8Array<ArrayBufferLike>): void
  disconnect(code: number, reason: string): void
  close(): void
}

export type SpoolRpcGatewayOptions = {
  ownerRuntimeId: string
  registry: SpoolRpcRegistry
  authorize: (
    access: SpoolMethodAccess,
    bound: BoundSpoolInvocation,
    principal: AuthenticatedSpoolPrincipal
  ) => void
  onConnectionOpened?: (principal: AuthenticatedSpoolPrincipal) => void
  onConnectionClosed?: (connectionId: string) => void
}

export class SpoolRpcGateway {
  private readonly connections = new Map<string, SpoolServerConnection>()

  constructor(private readonly options: SpoolRpcGatewayOptions) {}

  openConnection(
    principal: AuthenticatedSpoolPrincipal,
    transport: SpoolConnectionTransport
  ): SpoolServerConnection {
    try {
      this.connections.get(principal.connectionId)?.disconnect(1008, 'Connection replaced')
      this.options.onConnectionOpened?.(principal)
      let connection: SpoolServerConnection
      connection = new SpoolGatewayConnection(principal, transport, this.options, () => {
        if (this.connections.get(principal.connectionId) === connection) {
          this.connections.delete(principal.connectionId)
        }
      })
      this.connections.set(principal.connectionId, connection)
      return connection
    } catch (error) {
      // Why: connection setup composes authority and projection state; a later
      // setup failure must roll back any earlier connection-scoped state.
      try {
        this.options.onConnectionClosed?.(principal.connectionId)
      } catch {
        // Preserve the setup error after best-effort rollback.
      }
      throw error
    }
  }

  disconnectAll(reason: string): void {
    for (const connection of this.connections.values()) {
      connection.disconnect(1008, reason)
    }
  }
}

export function createSpoolRpcRegistry(methods: readonly SpoolRpcMethodSpec[]): SpoolRpcRegistry {
  const registry = new Map<string, SpoolRpcMethodSpec>()
  for (const method of methods) {
    if (!method.name || registry.has(method.name)) {
      throw new Error(`duplicate_spool_rpc_method:${method.name}`)
    }
    registry.set(method.name, method)
  }
  return registry
}
