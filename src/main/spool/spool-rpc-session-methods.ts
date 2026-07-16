import { z } from 'zod'
import { TERMINAL_INPUT_MAX_BYTES } from '../../shared/terminal-input'
import {
  SpoolMutationResultSchema,
  SpoolTerminalSubscriptionEventSchema
} from '../../shared/spool/spool-execution-result-schema'
import type { SpoolExecutionOperation } from '../../shared/spool/spool-operation-contract'
import type { SpoolExecutionGateway } from './spool-execution-gateway'
import { SpoolRpcError, type SpoolRpcMethodSpec } from './spool-rpc-gateway'
import {
  asHistoricalSessionInvocation,
  asLiveSessionInvocation,
  bindSpoolSession,
  bindSpoolTerminalMutationSession,
  spoolSessionExecutionTarget,
  type SpoolLiveSessionInvocation,
  type SpoolSessionMethodDependencies
} from './spool-rpc-session-binding'
import { createSpoolRpcStream } from './spool-rpc-stream'

const SessionParams = z.object({ sessionRef: z.string().min(1).max(2048) }).strict()
const SessionContinueResult = z.object({ sessionRef: z.string().min(1).max(2_048) }).strict()
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
        const projection = dependencies.catalog.getProjection(context.principal.connectionId)
        if (!projection?.retainSessionReference(invocation.sessionRef)) {
          throw new SpoolRpcError('resource_not_found')
        }
        // Why: paired-runtime outcome uncertainty may hide the new PTY handle;
        // retaining this alias lets catalog fallback attach without relaunching.
        const continued = await dependencies.execution.invoke(
          spoolSessionExecutionTarget(invocation, context.principal.connectionId),
          { kind: 'session.continue', ownerRecordKey: invocation.ownerRecordKey },
          context.signal
        )
        const terminalHandle = requireContinuedTerminalHandle(continued.terminalHandle)
        if (context.signal.aborted || !invocation.isCurrent()) {
          // Why: a completed launch must not resurrect an attachment after its
          // physical connection was closed or replaced.
          throw new SpoolRpcError('outcome_unknown')
        }
        // Why: retaining the already-known alias makes a lost continue response
        // recoverable by subscribing, without repeating the agent launch.
        dependencies.attachments.remember(
          context.principal.connectionId,
          invocation.sessionRef,
          invocation.worktree,
          invocation.session,
          terminalHandle
        )
        return { sessionRef: invocation.sessionRef }
      },
      project: (value) => SessionContinueResult.parse(value)
    },
    {
      name: 'terminal.subscribe',
      schema: TerminalSubscribeParams,
      access: 'worktree-read',
      streaming: true,
      bind: async (params, context) => {
        const parsed = TerminalSubscribeParams.parse(params)
        const bound = await bindSpoolSession(
          dependencies,
          context.principal.connectionId,
          parsed.sessionRef,
          'live',
          parsed
        )
        // Why: an explicitly opened live terminal must regain the same opaque
        // alias after a session-catalog generation rebuild, just like continuation.
        dependencies.catalog
          .getProjection(context.principal.connectionId)
          ?.retainSessionReference(parsed.sessionRef)
        return bound
      },
      execute: (bound, context) => {
        const invocation = asLiveSessionInvocation(bound)
        const parsed = TerminalSubscribeParams.parse(invocation.requestParams)
        return createTerminalSessionStream(
          dependencies,
          invocation,
          context.principal.connectionId,
          parsed.scrollbackRows
        )
      },
      project: (value) => SpoolTerminalSubscriptionEventSchema.parse(value)
    },
    {
      name: 'terminal.input',
      schema: TerminalInputParams,
      access: 'worktree-control',
      bind: async (params, context) => {
        const parsed = TerminalInputParams.parse(params)
        return bindSpoolTerminalMutationSession(
          dependencies,
          context.principal.connectionId,
          parsed.sessionRef,
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
          },
          context.signal
        )
      },
      project: projectTerminalMutationResult
    },
    {
      name: 'terminal.resize',
      schema: TerminalResizeParams,
      access: 'worktree-control',
      bind: async (params, context) => {
        const parsed = TerminalResizeParams.parse(params)
        return bindSpoolTerminalMutationSession(
          dependencies,
          context.principal.connectionId,
          parsed.sessionRef,
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
          },
          context.signal
        )
      },
      project: projectTerminalMutationResult
    }
  ]
}

function createTerminalSessionStream(
  dependencies: SpoolSessionMethodDependencies,
  invocation: SpoolLiveSessionInvocation,
  connectionId: string,
  scrollbackRows?: number
) {
  return createSpoolRpcStream(async (sink) => {
    const subscription = await dependencies.execution.subscribe(
      spoolSessionExecutionTarget(invocation, connectionId),
      {
        kind: 'terminal.subscribe',
        terminalRef: invocation.session.terminalHandle,
        ...(scrollbackRows === undefined ? {} : { scrollbackRows })
      },
      (event) => {
        if (event.kind === 'unavailable') {
          sink.error(new SpoolRpcError('resource_unavailable'))
          return
        }
        if (event.kind === 'closed') {
          dependencies.attachments.forget(connectionId, invocation.sessionRef)
          sink.next({
            kind: 'closed',
            canContinue:
              invocation.session.providerSessionId !== null &&
              invocation.session.provider !== 'other'
          })
          // Why: a naturally ended PTY must release the RPC request id even when the viewer stays mounted.
          sink.complete()
          return
        }
        sink.next(event)
      }
    )
    return () => subscription.close()
  })
}

function invokeTerminalSessionMutation(
  execution: SpoolExecutionGateway,
  invocation: SpoolLiveSessionInvocation,
  connectionId: string,
  operation: Extract<SpoolExecutionOperation, { kind: 'terminal.input' | 'terminal.resize' }>,
  signal: AbortSignal
): Promise<unknown> {
  return execution.invoke(
    spoolSessionExecutionTarget(invocation, connectionId),
    {
      ...operation,
      // Why: the requester selects only an alias; the owner supplies its live handle.
      terminalRef: invocation.session.terminalHandle
    },
    signal
  )
}

function projectTerminalMutationResult(value: unknown): unknown {
  const parsed = SpoolMutationResultSchema.safeParse(value)
  if (!parsed.success) {
    // Why: input or resize may already have reached the PTY before malformed acknowledgement.
    throw new SpoolRpcError('outcome_unknown')
  }
  return parsed.data
}

function requireContinuedTerminalHandle(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 2_048 ||
    value.includes('\0')
  ) {
    // Why: the agent may already be running, so an invalid host handoff is an
    // ambiguous mutation result rather than a safe invitation to retry.
    throw new SpoolRpcError('outcome_unknown')
  }
  return value
}
