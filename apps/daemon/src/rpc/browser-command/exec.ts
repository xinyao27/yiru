import type { BrowserAgentCommandResult } from '@yiru/runtime-protocol/contract'

import {
  executeExecFind,
  executeExecKeyboard,
  executeExecMouse,
  executeExecStorage,
  executeExecTab,
  executeExecWait
} from './exec-nested'
import type { BrowserCommandDelegate } from './router'

export type BrowserExecTarget = { page?: string; worktree?: string }

export async function executeBrowserExec(
  delegate: BrowserCommandDelegate,
  rawInput: unknown
): Promise<BrowserAgentCommandResult> {
  const input = requireRecord(rawInput)
  const command = requireString(input, 'command')
  const args = stripTransportArgs(parseShellArgs(command.trim()))
  const verb = args.shift()
  if (!verb) {
    throw new Error('browser_exec_command_missing')
  }
  const target = readTarget(input)
  switch (verb) {
    case 'snapshot':
    case 'read':
      return delegate('browser.snapshot', target)
    case 'open':
    case 'goto':
      return delegate('browser.goto', { ...target, url: requireExecArg(args, 0) })
    case 'back':
    case 'forward':
    case 'reload':
      return delegate(`browser.${verb}`, target)
    case 'click':
    case 'dblclick':
    case 'focus':
    case 'hover':
      return delegate(`browser.${verb}`, { ...target, element: requireExecArg(args, 0) })
    case 'scrollintoview':
      return delegate('browser.scrollIntoView', {
        ...target,
        element: requireExecArg(args, 0)
      })
    case 'highlight':
      return delegate('browser.highlight', { ...target, selector: requireExecArg(args, 0) })
    case 'fill':
    case 'select':
      return delegate(`browser.${verb}`, {
        ...target,
        element: requireExecArg(args, 0),
        value: requireExecArg(args, 1, true)
      })
    case 'type':
      return delegate('browser.type', { ...target, input: requireExecArg(args, 0) })
    case 'press':
      return delegate('browser.keypress', { ...target, key: requireExecArg(args, 0) })
    case 'check':
    case 'uncheck':
      return delegate('browser.check', {
        ...target,
        checked: verb === 'check',
        element: requireExecArg(args, 0)
      })
    case 'drag':
      return delegate('browser.drag', {
        ...target,
        from: requireExecArg(args, 0),
        to: requireExecArg(args, 1)
      })
    case 'eval':
      return delegate('browser.eval', { ...target, expression: requireExecArg(args, 0) })
    case 'scroll':
      return executeScroll(delegate, target, args)
    case 'wait':
      return executeExecWait(delegate, target, args)
    case 'get':
      return delegate('browser.get', {
        ...target,
        selector: args[1],
        what: requireExecArg(args, 0)
      })
    case 'is':
      return delegate('browser.is', {
        ...target,
        selector: requireExecArg(args, 1),
        what: requireExecArg(args, 0)
      })
    case 'find':
      return executeExecFind(delegate, target, args)
    case 'console':
    case 'errors':
      return delegate('browser.console', {
        ...target,
        limit: readExecNumber(readExecFlag(args, '--limit'))
      })
    case 'keyboard':
      return executeExecKeyboard(delegate, target, args)
    case 'mouse':
      return executeExecMouse(delegate, target, args)
    case 'tab':
      return executeExecTab(delegate, target, args)
    case 'storage':
      return executeExecStorage(delegate, target, args)
    case 'pushstate':
      return delegate('browser.eval', {
        ...target,
        expression: `history.pushState({}, '', ${JSON.stringify(requireExecArg(args, 0))}); location.href`
      })
    case 'vitals':
      return delegate('browser.eval', {
        ...target,
        expression:
          "JSON.stringify(performance.getEntriesByType('navigation').map(({domContentLoadedEventEnd,loadEventEnd,responseStart})=>({domContentLoadedEventEnd,loadEventEnd,responseStart})))"
      })
    default:
      throw new Error(`browser_exec_command_unsupported:${verb}`)
  }
}

function executeScroll(
  delegate: BrowserCommandDelegate,
  target: BrowserExecTarget,
  args: string[]
): Promise<BrowserAgentCommandResult> {
  const direction = args[0] === 'up' ? 'up' : args[0] === 'down' ? 'down' : null
  if (!direction) {
    throw new Error('browser_exec_scroll_direction_invalid')
  }
  return delegate('browser.scroll', {
    ...target,
    amount: readExecNumber(args[1]),
    direction
  })
}

function parseShellArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  for (const character of input) {
    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? null : character
    } else if (/\s/.test(character) && !quote) {
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += character
    }
  }
  if (quote) {
    throw new Error('browser_exec_quote_unclosed')
  }
  if (current) {
    args.push(current)
  }
  return args
}

function stripTransportArgs(args: string[]): string[] {
  return args.filter((arg, index) => {
    const previous = args[index - 1]
    return (
      !arg.startsWith('--cdp=') &&
      !arg.startsWith('--session=') &&
      previous !== '--cdp' &&
      previous !== '--session' &&
      arg !== '--cdp' &&
      arg !== '--session'
    )
  })
}

function readTarget(input: Record<string, unknown>): BrowserExecTarget {
  const page = Reflect.get(input, 'page')
  const worktree = Reflect.get(input, 'worktree')
  return {
    ...(typeof page === 'string' && page ? { page } : {}),
    ...(typeof worktree === 'string' ? { worktree } : {})
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('browser_exec_input_invalid')
  }
  return Object.fromEntries(Object.entries(value))
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = Reflect.get(input, key)
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`browser_exec_value_missing:${key}`)
  }
  return value
}

export function requireExecArg(args: string[], index: number, allowEmpty = false): string {
  const value = args[index]
  if (value === undefined || (!allowEmpty && !value)) {
    throw new Error(`browser_exec_argument_missing:${index}`)
  }
  return value
}

export function readExecFlag(args: string[], flag: string): string | undefined {
  const assigned = args.find((arg) => arg.startsWith(`${flag}=`))
  if (assigned) {
    return assigned.slice(flag.length + 1)
  }
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

export function readExecNumber(value: string | undefined): number | undefined {
  const number = value === undefined ? Number.NaN : Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function requireExecNumber(value: string | undefined): number {
  const number = readExecNumber(value)
  if (number === undefined) {
    throw new Error('browser_exec_number_invalid')
  }
  return number
}
