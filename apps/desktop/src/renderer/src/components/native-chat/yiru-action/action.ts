import type {
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '@yiru/workbench-model/agent'

import { parseCommands, readFlag } from './command'
import { describeAction } from './description'
import { parseResult, readFirstResultString, readResultString, type ParsedResult } from './result'

export type ActionVerb =
  | 'captured'
  | 'changed'
  | 'closed'
  | 'created'
  | 'dispatched'
  | 'focused'
  | 'inspected'
  | 'navigated'
  | 'read'
  | 'removed'
  | 'replied'
  | 'ran'
  | 'sent-to'
  | 'started'
  | 'stopped'
  | 'updated'
  | 'used'
  | 'waited'

export type ActionObject =
  | 'automation'
  | 'automations'
  | 'browser'
  | 'browser-tab'
  | 'computer'
  | 'gate'
  | 'gates'
  | 'message'
  | 'messages'
  | 'orchestration'
  | 'task'
  | 'tasks'
  | 'terminal'
  | 'terminals'
  | 'worktree'
  | 'worktrees'

export type YiruAction = {
  commandLabel: string
  verb: ActionVerb | null
  object: ActionObject | null
  target: string | null
  outcome: { kind: 'spawned'; value: string } | { kind: 'to'; value: string } | null
  status: ParsedResult['status']
  errorMessage: string | null
  jumpTarget: {
    worktreeId: string | null
    tabId: string | null
    terminalHandle: string | null
    browserPageId: string | null
  }
}

export function recognizeYiruActions(
  call: NativeChatToolCallBlock,
  result: NativeChatToolResultBlock | undefined
): YiruAction[] {
  const commands = parseCommands(call)
  const parsedResult = parseResult(result)
  // Why: one shell result cannot reliably identify which chained invocation
  // produced its JSON, so multi-card metadata comes only from each segment.
  const actionResult = commands.length === 1 ? parsedResult : { ...parsedResult, record: null }
  return commands.map((command) => buildAction(command.tokens, actionResult))
}

function buildAction(tokens: readonly string[], parsedResult: ParsedResult): YiruAction {
  const payload = parsedResult.record
  const terminalHandle =
    readResultString(payload, 'result', 'agentTerminalHandle') ??
    readResultString(payload, 'result', 'startupTerminal', 'handle') ??
    readFirstResultString(
      payload,
      ['terminal', 'send', 'focus', 'rename', 'split', 'close'],
      'handle'
    ) ??
    readFlag(tokens, 'terminal')
  return {
    commandLabel: `yiru ${tokens.slice(1, commandLabelEnd(tokens)).join(' ')}`.trim(),
    ...describeAction(tokens, parsedResult),
    status: parsedResult.status,
    errorMessage: parsedResult.errorMessage,
    jumpTarget: {
      worktreeId:
        readResultString(payload, 'result', 'worktree', 'id') ??
        readFirstResultString(payload, ['terminal', 'focus', 'tab'], 'worktreeId') ??
        readResultString(payload, 'result', 'worktreeId'),
      tabId:
        readFirstResultString(
          payload,
          ['terminal', 'focus', 'rename', 'split', 'close'],
          'tabId'
        ) ?? readResultString(payload, 'result', 'tabId'),
      terminalHandle,
      browserPageId:
        readResultString(payload, 'result', 'browserPageId') ??
        readResultString(payload, 'result', 'tab', 'browserPageId') ??
        readFlag(tokens, 'page')
    }
  }
}

function commandLabelEnd(tokens: readonly string[]): number {
  const grouped = ['automations', 'computer', 'orchestration', 'tab', 'terminal', 'worktree']
  return Math.min(tokens.length, grouped.includes(tokens[1] ?? '') ? 3 : 2)
}
