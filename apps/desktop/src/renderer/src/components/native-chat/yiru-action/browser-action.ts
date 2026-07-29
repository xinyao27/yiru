import type { YiruAction } from './action'
import { yiruFlag, yiruResultString, type ParsedYiruResult } from './command'

type BrowserActionDescription = Pick<YiruAction, 'verb' | 'object' | 'target' | 'outcome'>

const CAPTURE_COMMANDS = new Set(['full-screenshot', 'pdf', 'screenshot', 'snapshot'])
const INSPECT_COMMANDS = new Set(['console', 'get', 'is', 'network'])
const NAVIGATE_COMMANDS = new Set(['back', 'forward', 'goto', 'reload'])
const USE_COMMANDS = new Set([
  'capture',
  'check',
  'clear',
  'click',
  'clipboard',
  'cookie',
  'dblclick',
  'dialog',
  'download',
  'drag',
  'eval',
  'exec',
  'fill',
  'find',
  'focus',
  'geolocation',
  'highlight',
  'hover',
  'inserttext',
  'intercept',
  'keypress',
  'mouse',
  'scroll',
  'scrollintoview',
  'select',
  'select-all',
  'set',
  'storage',
  'type',
  'uncheck',
  'upload',
  'viewport',
  'wait'
])

export function describeYiruBrowserAction(
  tokens: readonly string[],
  result: ParsedYiruResult
): BrowserActionDescription | null {
  const command = tokens[1] ?? ''
  if (command === 'tab') {
    return describeTab(tokens, result)
  }
  if (NAVIGATE_COMMANDS.has(command)) {
    return action(
      'navigated',
      'browser',
      resultString(result, 'url') ?? resultString(result, 'title') ?? yiruFlag(tokens, 'url')
    )
  }
  if (CAPTURE_COMMANDS.has(command)) {
    return action('captured', 'browser', command)
  }
  if (INSPECT_COMMANDS.has(command)) {
    return action('inspected', 'browser', command)
  }
  if (USE_COMMANDS.has(command)) {
    return action('used', 'browser', browserTarget(tokens, command))
  }
  return null
}

function describeTab(
  tokens: readonly string[],
  result: ParsedYiruResult
): BrowserActionDescription | null {
  const operation = tokens[2] ?? ''
  const target =
    resultString(result, 'tab', 'title') ??
    resultString(result, 'browserPageId') ??
    yiruFlag(tokens, 'url') ??
    yiruFlag(tokens, 'page') ??
    yiruFlag(tokens, 'index')
  if (operation === 'create') {
    return action('created', 'browser-tab', target)
  }
  if (operation === 'switch') {
    return action('focused', 'browser-tab', target)
  }
  if (operation === 'close') {
    return action('closed', 'browser-tab', target)
  }
  if (operation === 'list' || operation === 'show' || operation === 'current') {
    return action('inspected', 'browser-tab', target)
  }
  return operation === 'profile' ? action('used', 'browser-tab', tokens[3] ?? 'profile') : null
}

function browserTarget(tokens: readonly string[], command: string): string {
  const detail =
    yiruFlag(tokens, 'element') ?? yiruFlag(tokens, 'page') ?? yiruFlag(tokens, 'worktree')
  return [command, detail].filter(Boolean).join(' ')
}

function resultString(result: ParsedYiruResult, ...path: readonly string[]): string | null {
  return yiruResultString(result.record, 'result', ...path)
}

function action(
  verb: BrowserActionDescription['verb'],
  object: BrowserActionDescription['object'],
  target: string | null
): BrowserActionDescription {
  return { verb, object, target: target?.trim() || null, outcome: null }
}
