import type { YiruAction, YiruActionObject, YiruActionVerb } from './yiru-action'
import { describeYiruBrowserAction } from './yiru-browser-action'
import { yiruFlag, yiruPositional, yiruResultString, type ParsedYiruResult } from './yiru-command'

type ActionDescription = Pick<YiruAction, 'verb' | 'object' | 'target' | 'outcome'>

const COMPUTER_INSPECT_COMMANDS = new Set([
  'capabilities',
  'get-app-state',
  'list-apps',
  'list-windows',
  'permissions'
])
const COMPUTER_USE_COMMANDS = new Set([
  'click',
  'drag',
  'hotkey',
  'paste-text',
  'perform-secondary-action',
  'press-key',
  'scroll',
  'set-value',
  'type-text'
])
const ORCHESTRATION_USE_COMMANDS = new Set([
  'ask',
  'check',
  'dispatch-show',
  'gate-create',
  'gate-list',
  'gate-resolve',
  'inbox',
  'reset'
])

export function describeYiruAction(
  tokens: readonly string[],
  result: ParsedYiruResult
): ActionDescription {
  const group = tokens[1] ?? ''
  const operation = tokens[2] ?? ''
  if (group === 'worktree') {
    return describeWorktree(tokens, operation, result)
  }
  if (group === 'terminal') {
    return describeTerminal(tokens, operation, result)
  }
  if (group === 'automations') {
    return describeAutomation(tokens, operation, result)
  }
  if (group === 'orchestration') {
    return describeOrchestration(tokens, operation, result)
  }
  if (group === 'computer') {
    const app = yiruFlag(tokens, 'app')
    if (COMPUTER_INSPECT_COMMANDS.has(operation)) {
      return action('inspected', 'computer', [operation, app].filter(Boolean).join(' ') || null)
    }
    return COMPUTER_USE_COMMANDS.has(operation)
      ? action('used', 'computer', [operation, app].filter(Boolean).join(' ') || null)
      : action(null, null, null)
  }
  return describeYiruBrowserAction(tokens, result) ?? action(null, null, null)
}

function describeWorktree(
  tokens: readonly string[],
  operation: string,
  result: ParsedYiruResult
): ActionDescription {
  const resultName = resultString(result, 'worktree', 'displayName')
  const selector = yiruFlag(tokens, 'worktree')
  if (operation === 'create') {
    const agent = yiruFlag(tokens, 'agent')
    return action(
      'created',
      'worktree',
      resultName ?? yiruFlag(tokens, 'name'),
      agent ? { kind: 'spawned', value: agent } : null
    )
  }
  if (operation === 'set') {
    return action('updated', 'worktree', resultName ?? selector)
  }
  if (operation === 'rm' || operation === 'remove' || operation === 'delete') {
    return action('removed', 'worktree', selector)
  }
  if (operation === 'list' || operation === 'ps') {
    return action('inspected', 'worktrees', selector ?? resultName)
  }
  if (operation === 'show' || operation === 'current') {
    return action('inspected', 'worktree', selector ?? resultName)
  }
  return action(null, null, null)
}

function describeTerminal(
  tokens: readonly string[],
  operation: string,
  result: ParsedYiruResult
): ActionDescription {
  const handle =
    firstResultString(
      result,
      ['terminal', 'send', 'focus', 'rename', 'split', 'close'],
      'handle'
    ) ?? yiruFlag(tokens, 'terminal')
  const title = resultString(result, 'terminal', 'title') ?? yiruFlag(tokens, 'title')
  if (operation === 'create') {
    return action('created', 'terminal', title ?? handle)
  }
  if (operation === 'send') {
    return action('sent-to', 'terminal', handle)
  }
  if (operation === 'switch' || operation === 'focus') {
    return action('focused', 'terminal', handle)
  }
  if (operation === 'read') {
    return action('read', 'terminal', handle)
  }
  if (operation === 'wait') {
    return action('waited', 'terminal', handle)
  }
  if (operation === 'rename' || operation === 'split') {
    return action('changed', 'terminal', title ?? handle)
  }
  if (operation === 'close') {
    return action('closed', 'terminal', handle)
  }
  if (operation === 'stop') {
    return action('stopped', 'terminals', yiruFlag(tokens, 'worktree'))
  }
  if (operation === 'list') {
    return action('inspected', 'terminals', handle)
  }
  if (operation === 'show') {
    return action('inspected', 'terminal', handle)
  }
  return action(null, null, null)
}

function describeAutomation(
  tokens: readonly string[],
  operation: string,
  result: ParsedYiruResult
): ActionDescription {
  const name = resultString(result, 'automation', 'name') ?? yiruFlag(tokens, 'name')
  const id = yiruFlag(tokens, 'id') ?? yiruPositional(tokens, 3)
  if (operation === 'create') {
    return action('created', 'automation', name)
  }
  if (operation === 'edit') {
    return action('updated', 'automation', name ?? id)
  }
  if (operation === 'run') {
    return action('ran', 'automation', name ?? id)
  }
  if (operation === 'remove') {
    return action('removed', 'automation', name ?? id)
  }
  if (operation === 'list' || operation === 'runs') {
    return action('inspected', 'automations', name ?? id)
  }
  if (operation === 'show') {
    return action('inspected', 'automation', name ?? id)
  }
  return action(null, null, null)
}

function describeOrchestration(
  tokens: readonly string[],
  operation: string,
  result: ParsedYiruResult
): ActionDescription {
  if (operation === 'send') {
    return action('sent-to', 'message', yiruFlag(tokens, 'to'))
  }
  if (operation === 'reply') {
    return action('replied', 'message', yiruFlag(tokens, 'id'))
  }
  if (operation === 'task-create') {
    return action(
      'created',
      'task',
      resultString(result, 'task', 'id') ?? yiruFlag(tokens, 'task-title')
    )
  }
  if (operation === 'task-update') {
    const target = [yiruFlag(tokens, 'id'), yiruFlag(tokens, 'status')].filter(Boolean).join(' → ')
    return action('updated', 'task', target || null)
  }
  if (operation === 'task-list') {
    return action('inspected', 'tasks', null)
  }
  if (operation === 'dispatch') {
    const recipient = yiruFlag(tokens, 'to')
    return action(
      'dispatched',
      'task',
      yiruFlag(tokens, 'task'),
      recipient ? { kind: 'to', value: recipient } : null
    )
  }
  if (operation === 'run') {
    return action('started', 'orchestration', resultString(result, 'runId'))
  }
  if (operation === 'run-stop') {
    return action('stopped', 'orchestration', resultString(result, 'runId'))
  }
  return ORCHESTRATION_USE_COMMANDS.has(operation)
    ? action('used', 'orchestration', operation)
    : action(null, null, null)
}

function resultString(result: ParsedYiruResult, ...path: readonly string[]): string | null {
  return yiruResultString(result.record, 'result', ...path)
}

function firstResultString(
  result: ParsedYiruResult,
  parents: readonly string[],
  field: string
): string | null {
  for (const parent of parents) {
    const value = resultString(result, parent, field)
    if (value) {
      return value
    }
  }
  return null
}

function action(
  verb: YiruActionVerb | null,
  object: YiruActionObject | null,
  target: string | null,
  outcome: YiruAction['outcome'] = null
): ActionDescription {
  return { verb, object, target: target?.trim() || null, outcome }
}
