import { z } from 'zod'
import { TERMINAL_INPUT_MAX_BYTES } from '../../shared/terminal-input'
import type { SpoolExecutionOperation } from '../../shared/spool/spool-operation-contract'
import type { SpoolExecutionGateway } from './spool-execution-gateway'
import type { SpoolRpcMethodSpec } from './spool-rpc-gateway'
import {
  asHistoricalSessionInvocation,
  asLiveSessionInvocation,
  bindSpoolSession,
  spoolSessionExecutionTarget,
  type SpoolLiveSessionInvocation,
  type SpoolSessionMethodDependencies
} from './spool-rpc-session-binding'
import { createSpoolRpcStream } from './spool-rpc-stream'

const SessionParams = z.object({ sessionRef: z.string().min(1).max(2048) }).strict()
const TerminalSubscribeParams = SessionParams.extend({
  scrollbackRows: z.number().int().nonnegative().max(100_000).optional()
}).strict()
const TerminalInputParams = SessionParams.extend({
  data: z
    .string()
    .max(TERMINAL_INPUT_MAX_BYTES)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= TERMINAL_INPUT_MAX_BYTES)
}).strict()
const TerminalResizeParams = SessionParams.extend({
  cols: z.number().int().min(1).max(1_000),
  rows: z.number().int().min(1).max(500)
}).strict()

export function createSpoolSessionRpcMethods(
  dependencies: SpoolSessionMethodDependencies
): readonly SpoolRpcMethodSpec[] {
  return [
    {
      name: 'session.read',
      schema: SessionParams,
      access: 'worktree-read',
      bind: async (params, context) => {
        const parsed = SessionParams.parse(params)
        return bindSpoolSession(
          dependencies,
          context.principal.connectionId,
          parsed.sessionRef,
          'historical',
          parsed
        )
      },
      execute: (bound, context) => {
        const invocation = asHistoricalSessionInvocation(bound)
        return dependencies.execution.invoke(
          spoolSessionExecutionTarget(invocation, context.principal.connectionId),
          { kind: 'session.read', ownerRecordKey: invocation.ownerRecordKey }
        )
      },
      project: identityProjector
    },
    {
      name: 'session.continue',
      schema: SessionParams,
      access: 'worktree-control',
      bind: async (params, context) => {
        const parsed = SessionParams.parse(params)
        return bindSpoolSession(
          dependencies,
          context.principal.connectionId,
          parsed.sessionRef,
          'historical',
          parsed
        )
      },
      execute: async (bound, context) => {
        const invocation = asHistoricalSessionInvocation(bound)
        await dependencies.execution.invoke(
          spoolSessionExecutionTarget(invocation, context.principal.connectionId),
          { kind: 'session.continue', ownerRecordKey: invocation.ownerRecordKey }
        )
        // Why: the requester can attach through the same alias after the live tab appears.
        return { sessionRef: invocation.sessionRef }
      },
      project: identityProjector
    },
    {
      name: 'terminal.subscribe',
      schema: TerminalSubscribeParams,
      access: 'worktree-read',
      streaming: true,
      bind: async (params, context) => {
        const parsed = TerminalSubscribeParams.parse(params)
        return bindSpoolSession(
          dependencies,
          context.principal.connectionId,
          parsed.sessionRef,
          'live',
          parsed
        )
      },
      execute: (bound, context) => {
        const invocation = asLiveSessionInvocation(bound)
        const parsed = TerminalSubscribeParams.parse(invocation.requestParams)
        return createTerminalSessionStream(
          dependencies.execution,
          invocation,
          context.principal.connectionId,
          parsed.scrollbackRows
        )
      },
      project: identityProjector
    },
    {
      name: 'terminal.input',
      schema: TerminalInputParams,
      access: 'worktree-control',
      bind: async (params, context) => {
        const parsed = TerminalInputParams.parse(params)
        return bindSpoolSession(
          dependencies,
          context.principal.connectionId,
          parsed.sessionRef,
          'live',
          parsed
        )
      },
      execute: (bound, context) => {
        const invocation = asLiveSessionInvocation(bound)
        const parsed = TerminalInputParams.parse(invocation.requestParams)
        return invokeTerminalSessionMutation(
          dependencies.execution,
          invocation,
          context.principal.connectionId,
          {
            kind: 'terminal.input',
            terminalRef: invocation.session.terminalHandle,
            data: parsed.data
          }
        )
      },
      project: identityProjector
    },
    {
      name: 'terminal.resize',
      schema: TerminalResizeParams,
      access: 'worktree-control',
      bind: async (params, context) => {
        const parsed = TerminalResizeParams.parse(params)
        return bindSpoolSession(
          dependencies,
          context.principal.connectionId,
          parsed.sessionRef,
          'live',
          parsed
        )
      },
      execute: (bound, context) => {
        const invocation = asLiveSessionInvocation(bound)
        const parsed = TerminalResizeParams.parse(invocation.requestParams)
        return invokeTerminalSessionMutation(
          dependencies.execution,
          invocation,
          context.principal.connectionId,
          {
            kind: 'terminal.resize',
            terminalRef: invocation.session.terminalHandle,
            cols: parsed.cols,
            rows: parsed.rows
          }
        )
      },
      project: identityProjector
    }
  ]
}

function createTerminalSessionStream(
  execution: SpoolExecutionGateway,
  invocation: SpoolLiveSessionInvocation,
  connectionId: string,
  scrollbackRows?: number
) {
  return createSpoolRpcStream(async (sink) => {
    const subscription = await execution.subscribe(
      spoolSessionExecutionTarget(invocation, connectionId),
      {
        kind: 'terminal.subscribe',
        terminalRef: invocation.session.terminalHandle,
        ...(scrollbackRows === undefined ? {} : { scrollbackRows })
      },
      (event) => sink.next(event)
    )
    return () => subscription.close()
  })
}

function invokeTerminalSessionMutation(
  execution: SpoolExecutionGateway,
  invocation: SpoolLiveSessionInvocation,
  connectionId: string,
  operation: Extract<SpoolExecutionOperation, { kind: 'terminal.input' | 'terminal.resize' }>
): Promise<unknown> {
  return execution.invoke(spoolSessionExecutionTarget(invocation, connectionId), {
    ...operation,
    // Why: the requester selects only an alias; the owner supplies its live handle.
    terminalRef: invocation.session.terminalHandle
  })
}

function identityProjector(value: unknown): unknown {
  return value
}
