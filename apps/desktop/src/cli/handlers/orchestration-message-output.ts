import type { AgentTranscriptMessage } from '@yiru/workbench-model/agent'
import { ORCHESTRATION_LEGACY_RUN_ID } from '~shared/orchestration-rpc-contract'
import type { OrchestrationWorkerReadResult } from '~shared/orchestration-worker-output'
import type { RuntimeTerminalRead } from '~shared/runtime-types'
import { resolveYiruCliCommandName } from '~shared/yiru-cli-command-name'

import { isDevCliInvocation } from './orchestration-handler-flags'

const DEFAULT_KEEPALIVE_INTERVAL_MS = 15_000

export type MessageSummary = {
  id: string
  run_id?: string
  from_handle: string
  to_handle?: string
  subject?: string
  type?: string
  body?: string
  payload?: string | null
  priority?: string
  read?: number
}

type LegacyWorkerReadResult = { dispatchId: string; terminal: RuntimeTerminalRead }

export function startCheckKeepalive(deadlineMs: number | undefined): () => void {
  const startedAt = Date.now()
  const interval = setInterval(() => {
    process.stderr.write(
      `${JSON.stringify({
        _keepalive: true,
        _heartbeat: true,
        elapsedMs: Date.now() - startedAt,
        deadlineMs: deadlineMs ?? null
      })}\n`
    )
  }, resolveKeepaliveIntervalMs())
  if (typeof interval.unref === 'function') {
    interval.unref()
  }
  return () => clearInterval(interval)
}

export function formatMessageReadOnlyTag(message: MessageSummary): string {
  return message.run_id === ORCHESTRATION_LEGACY_RUN_ID ? ' [legacy, read-only]' : ''
}

export function isLegacyReadOnlyMessage(message: MessageSummary): boolean {
  return message.run_id === ORCHESTRATION_LEGACY_RUN_ID
}

export function formatLegacyAwareCheckMessages(
  messages: MessageSummary[],
  checkedTerminal: string
): string {
  const cliCommand = resolveYiruCliCommandName({
    configuredCommand: process.env.YIRU_CLI_COMMAND,
    environment: isDevCliInvocation() ? 'development' : 'production',
    platform: process.platform
  })
  return messages
    .map((message) => {
      const legacy = isLegacyReadOnlyMessage(message)
      const priority =
        message.priority === 'urgent' ? ' [URGENT]' : message.priority === 'high' ? ' [HIGH]' : ''
      const lines = [
        `${message.id}${formatMessageReadOnlyTag(message)}${priority} [${message.type ?? 'status'}] from=${message.from_handle}`,
        formatQuotedField('subject', message.subject)
      ]
      if (legacy) {
        lines.push('[Inspection only: reply and acknowledgment are unavailable.]')
      }
      if (message.body) {
        lines.push(formatQuotedField('body', message.body))
      }
      if (message.payload) {
        lines.push(formatQuotedField('payload', message.payload))
      }
      if (!legacy) {
        const replyFrom = message.to_handle ?? checkedTerminal
        lines.push(
          `[Reply: ${cliCommand} orchestration reply --id ${message.id} --from ${replyFrom} --body "..."]`
        )
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

export function formatCheckResult(result: {
  messages: MessageSummary[]
  count: number
  formatted?: string
  deliveryId?: string | null
  timedOut?: boolean
  cancelled?: boolean
  connectionLost?: boolean
}): string {
  if (result.formatted) {
    return result.formatted
  }
  if (result.count === 0) {
    if (result.timedOut) {
      return 'Wait timed out; no messages were consumed.'
    }
    if (result.cancelled) {
      return result.connectionLost
        ? 'Wait cancelled because the connection closed; no messages were consumed.'
        : 'Wait cancelled; no messages were consumed.'
    }
    return 'No messages.'
  }
  const rendered = result.messages
    .map(
      (message) =>
        `${message.id}${formatMessageReadOnlyTag(message)} [${message.type ?? 'status'}] from=${message.from_handle} "${message.subject}"`
    )
    .join('\n')
  return result.deliveryId ? `Delivery ${result.deliveryId}\n${rendered}` : rendered
}

export function formatWorkerRead(
  value: OrchestrationWorkerReadResult | LegacyWorkerReadResult
): string {
  return !('source' in value) || value.source === 'terminal'
    ? value.terminal.tail.join('\n')
    : value.transcript.messages.map(formatWorkerTranscriptMessage).join('\n\n')
}

function resolveKeepaliveIntervalMs(): number {
  const raw = process.env.YIRU_KEEPALIVE_INTERVAL_MS ?? process.env.YIRU_HEARTBEAT_INTERVAL_MS
  if (!raw) {
    return DEFAULT_KEEPALIVE_INTERVAL_MS
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_KEEPALIVE_INTERVAL_MS
}

function formatQuotedField(label: string, value?: string): string {
  return `[${label}]\n${escapeTerminalControlCharacters(value ?? '')
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')}`
}

function escapeTerminalControlCharacters(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0)
      return character === '\n' || (code >= 0x20 && code < 0x7f) || code > 0x9f
        ? character
        : `\\x${code.toString(16).padStart(2, '0')}`
    })
    .join('')
}

function formatWorkerTranscriptMessage(message: AgentTranscriptMessage): string {
  const blocks = message.blocks.map((block) => {
    if (block.type === 'text') {
      return block.text
    }
    if (block.type === 'tool-call') {
      return `[tool ${block.name}] ${safeJson(block.input)}`
    }
    if (block.type === 'tool-result') {
      return `[tool result${block.isError ? ' error' : ''}] ${block.output}`
    }
    return block.url ? `[image] ${block.url}` : '[image omitted]'
  })
  return `[${message.role}] ${blocks.join('\n')}`.trimEnd()
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable input]'
  }
}
