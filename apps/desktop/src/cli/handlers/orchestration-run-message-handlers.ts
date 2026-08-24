import { orchestrationSkillRecoveryData } from '~shared/orchestration-rpc-contract'

import type { CommandHandler } from '../dispatch'
import {
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import type { RuntimeRpcSuccess } from '../runtime/types'
import {
  callOrchestrationMutation,
  getOptionalChoiceFlag,
  getOptionalPositiveIntegerValueFlag,
  getOptionalStructuredMessagePayload,
  isDevCliInvocation,
  MESSAGE_PRIORITY_VALUES,
  MESSAGE_TYPE_VALUES,
  rejectLifecycleGroupRecipient
} from './orchestration-handler-flags'
import {
  resolveCoordinatorTerminalHandle,
  resolveOrchestrationTerminalHandle,
  throwNoActiveSenderTerminal
} from './orchestration-handler-terminal'
import {
  formatLegacyAwareCheckMessages,
  formatCheckResult,
  formatMessageReadOnlyTag,
  isLegacyReadOnlyMessage,
  startCheckKeepalive,
  type MessageSummary
} from './orchestration-message-output'

export const ORCHESTRATION_RUN_MESSAGE_HANDLERS: Record<string, CommandHandler> = {
  'orchestration run-create': async ({ flags, client, cwd, json }) => {
    const from = await resolveCoordinatorTerminalHandle(flags, cwd, client)
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.runCreate,
      { objective: getRequiredStringFlag(flags, 'objective'), from }
    )
    printResult(
      result,
      json,
      (value) => `Run ${value.run.id} created and bound: ${value.run.objective}`
    )
  },
  'orchestration run-use': async ({ flags, client, cwd, json }) => {
    const from = await resolveCoordinatorTerminalHandle(flags, cwd, client)
    const result = await callOrchestrationMutation(client, flags, client.rpc.orchestration.runUse, {
      id: getRequiredStringFlag(flags, 'id'),
      from
    })
    printResult(result, json, (value) => `Using Run ${value.run.id}: ${value.run.objective}`)
  },
  'orchestration run-current': async ({ flags, client, cwd, json }) => {
    const from = await resolveCoordinatorTerminalHandle(flags, cwd, client)
    const result = await client.call(client.rpc.orchestration.runCurrent, { from })
    printResult(result, json, (value) =>
      value.run ? `${value.run.id} ${value.run.objective}` : 'No Run is bound to this terminal.'
    )
  },
  'orchestration run-list': async ({ client, json }) => {
    const result = await client.call(client.rpc.orchestration.runList, {})
    printResult(result, json, (value) =>
      value.runs.length === 0
        ? 'No Runs found.'
        : value.runs
            .map(
              (run) => `${run.id}${run.legacy ? ' [legacy, inspect only]' : ''} ${run.objective}`
            )
            .join('\n')
    )
  },
  'orchestration run-show': async ({ flags, client, json }) => {
    const result = await client.call(client.rpc.orchestration.runShow, {
      id: getRequiredStringFlag(flags, 'id')
    })
    printResult(
      result,
      json,
      (value) =>
        `${value.run.id}${value.run.legacy ? ' [legacy, inspect only]' : ''} ${value.run.objective}\n` +
        `consumer generation ${value.run.consumer_generation}; created ${value.run.created_at}`
    )
  },
  'orchestration send': async ({ flags, client, cwd, json }) => {
    const to = getOptionalStringFlag(flags, 'to')
    const type = getOptionalChoiceFlag(flags, 'type', MESSAGE_TYPE_VALUES)
    if (to) {
      rejectLifecycleGroupRecipient(type, to)
    }
    const outcome = getOptionalStringFlag(flags, 'outcome')
    if (type === 'worker_done' && outcome === undefined && !flags.has('payload')) {
      throw new RuntimeClientError(
        'invalid_argument',
        'worker_done requires --outcome succeeded or --outcome failed. No effects were applied.',
        orchestrationSkillRecoveryData()
      )
    }
    if (type !== 'worker_done' && outcome !== undefined) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--outcome is only valid with --type worker_done.'
      )
    }
    if (
      (type === 'worker_done' || type === 'heartbeat') &&
      !getOptionalStringFlag(flags, 'from') &&
      !process.env.YIRU_TERMINAL_HANDLE
    ) {
      throwNoActiveSenderTerminal()
    }
    const from = await resolveOrchestrationTerminalHandle(flags, cwd, client, 'from')
    const capability = getOptionalStringFlag(flags, 'dispatch-capability')
    const result = await callOrchestrationMutation(
      client,
      flags,
      client.rpc.orchestration.send,
      {
        from,
        to,
        run: getOptionalStringFlag(flags, 'run'),
        subject: getRequiredStringFlag(flags, 'subject'),
        body: getOptionalStringFlag(flags, 'body'),
        type,
        priority: getOptionalChoiceFlag(flags, 'priority', MESSAGE_PRIORITY_VALUES),
        threadId: getOptionalStringFlag(flags, 'thread-id'),
        payload: getOptionalStructuredMessagePayload(flags),
        senderPaneKey: process.env.YIRU_PANE_KEY || undefined,
        devMode: isDevCliInvocation()
      },
      capability ? { orchestrationCapability: capability } : undefined
    )
    if ('message' in result.result && result.result.lifecycle?.action === 'rejected') {
      process.exitCode = 1
    }
    printResult(result, json, (value) => {
      if ('message' in value) {
        return value.lifecycle?.action === 'rejected'
          ? `Rejected ${value.message.id}: ${value.lifecycle.reason}`
          : `Sent ${value.message.id}`
      }
      if ('relay' in value) {
        return value.relay.destination === 'worker'
          ? `Queued ${value.relay.messageId} for worker Dispatch ${value.relay.dispatchId}`
          : `Queued ${value.relay.messageId} for Run home (Dispatch ${value.relay.dispatchId})`
      }
      return `Sent ${value.messages.length} messages to ${value.recipients} recipients`
    })
  },
  'orchestration check': async ({ flags, client, cwd, json }) => {
    const wait = flags.has('wait')
    const peek = flags.has('peek')
    if ([flags.has('unread'), peek, flags.has('all')].filter(Boolean).length > 1) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Choose at most one message read mode: --unread, --peek, or --all.'
      )
    }
    const timeoutMs = getOptionalPositiveIntegerValueFlag(flags, 'timeout-ms')
    const explicitTerminal = getOptionalStringFlag(flags, 'terminal')
    const terminal = await resolveOrchestrationTerminalHandle(flags, cwd, client, 'terminal')
    const stopKeepalive = wait ? startCheckKeepalive(timeoutMs) : null
    type CheckResult = {
      messages: MessageSummary[]
      count: number
      formatted?: string
      deliveryId?: string | null
      runId?: string
      timedOut?: boolean
      cancelled?: boolean
      connectionLost?: boolean
    }
    let result: RuntimeRpcSuccess<CheckResult>
    try {
      result = await callOrchestrationMutation(client, flags, client.rpc.orchestration.check, {
        terminal,
        terminalPaneKey: explicitTerminal ? undefined : process.env.YIRU_PANE_KEY || undefined,
        unread: flags.has('unread') ? true : peek ? false : undefined,
        peek: peek ? true : undefined,
        all: flags.has('all') ? true : undefined,
        types: getOptionalStringFlag(flags, 'types'),
        format: flags.has('format') ? true : undefined,
        run: getOptionalStringFlag(flags, 'run'),
        ack: getOptionalStringFlag(flags, 'ack'),
        wait: wait ? true : undefined,
        timeoutMs
      })
    } finally {
      stopKeepalive?.()
    }
    if (peek) {
      result = filterPeekResult(result, wait)
    }
    if (flags.has('format') && result.result.messages.some(isLegacyReadOnlyMessage)) {
      result = {
        ...result,
        result: {
          ...result.result,
          formatted: formatLegacyAwareCheckMessages(result.result.messages, terminal)
        }
      }
    }
    printResult(result, json, formatCheckResult)
  },
  'orchestration reply': async ({ flags, client, cwd, json }) => {
    const from = await resolveOrchestrationTerminalHandle(flags, cwd, client, 'from')
    const result = await callOrchestrationMutation(client, flags, client.rpc.orchestration.reply, {
      id: getRequiredStringFlag(flags, 'id'),
      body: getRequiredStringFlag(flags, 'body'),
      run: getOptionalStringFlag(flags, 'run'),
      from
    })
    printResult(result, json, (value) => `Replied ${value.message.id}`)
  },
  'orchestration inbox': async ({ flags, client, json }) => {
    const full = flags.has('full')
    const result = await client.call(client.rpc.orchestration.inbox, {
      limit: getOptionalPositiveIntegerFlag(flags, 'limit'),
      terminal: getOptionalStringFlag(flags, 'terminal')
    })
    printResult(result, json, (value) => {
      if (value.count === 0) {
        return 'No messages.'
      }
      return value.messages
        .map((message) => {
          const head = `${message.id}${formatMessageReadOnlyTag(message)} ${message.from_handle} -> ${message.to_handle ?? '?'}: "${message.subject}"`
          if (!full) {
            return head
          }
          const parts = [head]
          if (message.body) {
            parts.push(message.body)
          }
          if (message.payload) {
            parts.push(`[payload] ${message.payload}`)
          }
          return parts.join('\n')
        })
        .join(full ? '\n\n' : '\n')
    })
  }
}

function filterPeekResult<
  T extends { messages: MessageSummary[]; count: number; formatted?: string }
>(result: RuntimeRpcSuccess<T>, wait: boolean): RuntimeRpcSuccess<T> {
  const rawCount = result.result.messages.length
  const unreadOnly = result.result.messages.filter((message) => message.read !== 1)
  const removedReadRows = unreadOnly.length !== rawCount
  if (wait && removedReadRows && unreadOnly.length === 0) {
    throw new RuntimeClientError(
      'peek_wait_unsupported',
      'The connected runtime does not support --peek with --wait; upgrade the runtime or use --wait without --peek.'
    )
  }
  if (removedReadRows && rawCount >= 100) {
    console.error(
      'Warning: this runtime returned only its newest 100 messages for --peek; older unread messages may be missing. Upgrade the runtime for exact peek results.'
    )
  }
  return {
    ...result,
    result: {
      ...result.result,
      ...(removedReadRows ? { formatted: undefined } : {}),
      messages: unreadOnly,
      count: unreadOnly.length
    }
  }
}
