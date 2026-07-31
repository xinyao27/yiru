import type { ZodType } from 'zod'
import type { AuthenticatedCoworkingPrincipal } from '~shared/rpc-principal'

import { CoworkingGatewayConnection } from './server-connection'

export { CoworkingRpcError } from './error'

export type CoworkingMethodAccess = 'catalog-read' | 'worktree-read' | 'worktree-control'

export type BoundCoworkingInvocation = {
  value: unknown
  isCurrent: () => boolean
  subscribeInvalidation?: (listener: () => void) => () => void
}

export type CoworkingRpcInvocationContext = {
  principal: AuthenticatedCoworkingPrincipal
  requestId: string
  signal: AbortSignal
}

export type CoworkingRpcMethodSpec = {
  name: string
  schema: ZodType
  access: CoworkingMethodAccess
  streaming?: boolean
  bind: (
    params: unknown,
    context: CoworkingRpcInvocationContext
  ) => Promise<BoundCoworkingInvocation> | BoundCoworkingInvocation
  execute: (bound: unknown, context: CoworkingRpcInvocationContext) => Promise<unknown> | unknown
  project: (result: unknown) => unknown
}

export type CoworkingRpcRegistry = ReadonlyMap<string, CoworkingRpcMethodSpec>

export type CoworkingConnectionTransport = {
  sendJson: (frame: string, streamKey?: string) => void
  close: (code: number, reason: string) => void
}

export type CoworkingServerConnection = {
  dispatchJson(frame: string): void
  dispatchBinary(frame: Uint8Array<ArrayBufferLike>): void
  disconnect(code: number, reason: string): void
  close(): void
}

export type CoworkingRpcGatewayOptions = {
  ownerRuntimeId: string
  registry: CoworkingRpcRegistry
  authorize: (
    access: CoworkingMethodAccess,
    bound: BoundCoworkingInvocation,
    principal: AuthenticatedCoworkingPrincipal
  ) => void
  onConnectionOpened?: (principal: AuthenticatedCoworkingPrincipal) => void
  onConnectionClosed?: (connectionId: string) => void
}

export class CoworkingRpcGateway {
  private readonly connections = new Map<string, CoworkingServerConnection>()

  constructor(private readonly options: CoworkingRpcGatewayOptions) {}

  openConnection(
    principal: AuthenticatedCoworkingPrincipal,
    transport: CoworkingConnectionTransport
  ): CoworkingServerConnection {
    try {
      this.connections.get(principal.connectionId)?.disconnect(1008, 'Connection replaced')
      this.options.onConnectionOpened?.(principal)
      let connection: CoworkingServerConnection
      connection = new CoworkingGatewayConnection(principal, transport, this.options, () => {
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

export function createCoworkingRpcRegistry(
  methods: readonly CoworkingRpcMethodSpec[]
): CoworkingRpcRegistry {
  const registry = new Map<string, CoworkingRpcMethodSpec>()
  for (const method of methods) {
    if (!method.name || registry.has(method.name)) {
      throw new Error(`duplicate_coworking_rpc_method:${method.name}`)
    }
    registry.set(method.name, method)
  }
  return registry
}
