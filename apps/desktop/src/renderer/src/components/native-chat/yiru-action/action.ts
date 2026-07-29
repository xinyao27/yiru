import type {
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '@yiru/workbench-model/agent'

import {
  parseYiruCommand,
  parseYiruResult,
  yiruFirstResultString,
  yiruFlag,
  yiruResultString,
  type ParsedYiruResult
} from './command'
import { describeYiruAction } from './description'

export type YiruActionVerb =
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

export type YiruActionObject =
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
  verb: YiruActionVerb | null
  object: YiruActionObject | null
  target: string | null
  outcome: { kind: 'spawned'; value: string } | { kind: 'to'; value: string } | null
  status: ParsedYiruResult['status']
  errorMessage: string | null
  jumpTarget: {
    worktreeId: string | null
    tabId: string | null
    terminalHandle: string | null
    browserPageId: string | null
  }
}

export function recognizeYiruAction(
  call: NativeChatToolCallBlock,
  result: NativeChatToolResultBlock | undefined
): YiruAction | null {
  const command = parseYiruCommand(call)
  if (!command) {
    return null
  }
  const parsedResult = parseYiruResult(result)
  const tokens = command.tokens
  const payload = parsedResult.record
  const terminalHandle =
    yiruResultString(payload, 'result', 'agentTerminalHandle') ??
    yiruResultString(payload, 'result', 'startupTerminal', 'handle') ??
    yiruFirstResultString(
      payload,
      ['terminal', 'send', 'focus', 'rename', 'split', 'close'],
      'handle'
    ) ??
    yiruFlag(tokens, 'terminal')
  return {
    commandLabel: `yiru ${tokens.slice(1, commandLabelEnd(tokens)).join(' ')}`.trim(),
    ...describeYiruAction(tokens, parsedResult),
    status: parsedResult.status,
    errorMessage: parsedResult.errorMessage,
    jumpTarget: {
      worktreeId:
        yiruResultString(payload, 'result', 'worktree', 'id') ??
        yiruFirstResultString(payload, ['terminal', 'focus', 'tab'], 'worktreeId') ??
        yiruResultString(payload, 'result', 'worktreeId'),
      tabId:
        yiruFirstResultString(
          payload,
          ['terminal', 'focus', 'rename', 'split', 'close'],
          'tabId'
        ) ?? yiruResultString(payload, 'result', 'tabId'),
      terminalHandle,
      browserPageId:
        yiruResultString(payload, 'result', 'browserPageId') ??
        yiruResultString(payload, 'result', 'tab', 'browserPageId') ??
        yiruFlag(tokens, 'page')
    }
  }
}

function commandLabelEnd(tokens: readonly string[]): number {
  const grouped = ['automations', 'computer', 'orchestration', 'tab', 'terminal', 'worktree']
  return Math.min(tokens.length, grouped.includes(tokens[1] ?? '') ? 3 : 2)
}
