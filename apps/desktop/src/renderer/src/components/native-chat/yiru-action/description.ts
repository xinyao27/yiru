import type { ActionObject, ActionVerb, YiruAction } from './action'
import { describeBrowserAction } from './browser'
import { readFlag, readPositional } from './command'
import { readFirstResultString, readPayloadString, type ParsedResult } from './result'

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
export function describeAction(tokens: readonly string[], result: ParsedResult): ActionDescription {
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
    const app = readFlag(tokens, 'app')
    if (COMPUTER_INSPECT_COMMANDS.has(operation)) {
      return action('inspected', 'computer', [operation, app].filter(Boolean).join(' ') || null)
    }
    return COMPUTER_USE_COMMANDS.has(operation)
      ? action('used', 'computer', [operation, app].filter(Boolean).join(' ') || null)
      : action(null, null, null)
  }
  return describeBrowserAction(tokens, result) ?? action(null, null, null)
}

function describeWorktree(
  tokens: readonly string[],
  operation: string,
  result: ParsedResult
): ActionDescription {
  const resultName = readPayloadString(result, 'worktree', 'displayName')
  const selector = readFlag(tokens, 'worktree')
  if (operation === 'create') {
    const agent = readFlag(tokens, 'agent')
    return action(
      'created',
      'worktree',
      resultName ?? readFlag(tokens, 'name'),
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
  result: ParsedResult
): ActionDescription {
  const handle =
    readFirstResultString(
      result.record,
      ['terminal', 'send', 'focus', 'rename', 'split', 'close'],
      'handle'
    ) ?? readFlag(tokens, 'terminal')
  const title = readPayloadString(result, 'terminal', 'title') ?? readFlag(tokens, 'title')
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
    return action('stopped', 'terminals', readFlag(tokens, 'worktree'))
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
  result: ParsedResult
): ActionDescription {
  const name = readPayloadString(result, 'automation', 'name') ?? readFlag(tokens, 'name')
  const id = readFlag(tokens, 'id') ?? readPositional(tokens, 3)
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
  result: ParsedResult
): ActionDescription {
  if (operation === 'send') {
    return action('sent-to', 'message', readFlag(tokens, 'to'))
  }
  if (operation === 'reply') {
    return action('replied', 'message', readFlag(tokens, 'id'))
  }
  if (operation === 'ask') {
    return action('sent-to', 'terminal', readFlag(tokens, 'to'))
  }
  if (operation === 'check' || operation === 'inbox') {
    return action('inspected', 'messages', readFlag(tokens, 'terminal'))
  }
  if (operation === 'task-create') {
    return action(
      'created',
      'task',
      readPayloadString(result, 'task', 'id') ?? readFlag(tokens, 'task-title')
    )
  }
  if (operation === 'task-update') {
    const target = [readFlag(tokens, 'id'), readFlag(tokens, 'status')].filter(Boolean).join(' → ')
    return action('updated', 'task', target || null)
  }
  if (operation === 'task-list') {
    return action('inspected', 'tasks', null)
  }
  if (operation === 'dispatch') {
    const recipient = readFlag(tokens, 'to')
    return action(
      'dispatched',
      'task',
      readFlag(tokens, 'task'),
      recipient ? { kind: 'to', value: recipient } : null
    )
  }
  if (operation === 'dispatch-show') {
    return action(
      'inspected',
      'task',
      readPayloadString(result, 'dispatch', 'task_id') ?? readFlag(tokens, 'task')
    )
  }
  if (operation === 'run') {
    return action('started', 'orchestration', readPayloadString(result, 'runId'))
  }
  if (operation === 'run-stop') {
    return action('stopped', 'orchestration', readPayloadString(result, 'runId'))
  }
  if (operation === 'gate-create') {
    const taskId = readPayloadString(result, 'gate', 'task_id') ?? readFlag(tokens, 'task')
    return action(
      'created',
      'gate',
      readPayloadString(result, 'gate', 'id'),
      taskId ? { kind: 'to', value: taskId } : null
    )
  }
  if (operation === 'gate-resolve') {
    return action(
      'updated',
      'gate',
      readPayloadString(result, 'gate', 'id') ?? readFlag(tokens, 'id')
    )
  }
  if (operation === 'gate-list') {
    return action('inspected', 'gates', readFlag(tokens, 'task'))
  }
  if (operation === 'reset') {
    return action('changed', 'orchestration', readPayloadString(result, 'reset'))
  }
  return action(null, null, null)
}

function action(
  verb: ActionVerb | null,
  object: ActionObject | null,
  target: string | null,
  outcome: YiruAction['outcome'] = null
): ActionDescription {
  return { verb, object, target: target?.trim() || null, outcome }
}
