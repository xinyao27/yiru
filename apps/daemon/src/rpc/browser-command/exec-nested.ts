import type { BrowserAgentCommandResult } from '@yiru/runtime-protocol/contract'

import {
  type BrowserExecTarget,
  readExecFlag,
  readExecNumber,
  requireExecArg,
  requireExecNumber
} from './exec'
import type { BrowserCommandDelegate } from './router'

export function executeExecWait(
  delegate: BrowserCommandDelegate,
  target: BrowserExecTarget,
  args: string[]
): Promise<BrowserAgentCommandResult> {
  const first = args[0]?.startsWith('--') ? undefined : args[0]
  const firstNumber = readExecNumber(first)
  return delegate('browser.wait', {
    ...target,
    fn: readExecFlag(args, '--fn'),
    load: readExecFlag(args, '--load'),
    selector: firstNumber === undefined ? first : undefined,
    state: readExecFlag(args, '--state'),
    text: readExecFlag(args, '--text'),
    timeout: readExecNumber(readExecFlag(args, '--timeout')) ?? firstNumber,
    url: readExecFlag(args, '--url')
  })
}

export function executeExecFind(
  delegate: BrowserCommandDelegate,
  target: BrowserExecTarget,
  args: string[]
): Promise<BrowserAgentCommandResult> {
  return delegate('browser.find', {
    ...target,
    action: readExecFlag(args, '--action') ?? requireExecArg(args, 2),
    locator: readExecFlag(args, '--locator') ?? requireExecArg(args, 0),
    text: readExecFlag(args, '--text'),
    value: readExecFlag(args, '--value') ?? requireExecArg(args, 1)
  })
}

export function executeExecKeyboard(
  delegate: BrowserCommandDelegate,
  target: BrowserExecTarget,
  args: string[]
): Promise<BrowserAgentCommandResult> {
  if (args[0] !== 'inserttext') {
    throw new Error('browser_exec_keyboard_command_unsupported')
  }
  return delegate('browser.keyboardInsertText', { ...target, text: requireExecArg(args, 1) })
}

export function executeExecMouse(
  delegate: BrowserCommandDelegate,
  target: BrowserExecTarget,
  args: string[]
): Promise<BrowserAgentCommandResult> {
  switch (args[0]) {
    case 'move':
      return delegate('browser.mouseMove', {
        ...target,
        x: requireExecNumber(args[1]),
        y: requireExecNumber(args[2])
      })
    case 'down':
    case 'up':
      return delegate(args[0] === 'down' ? 'browser.mouseDown' : 'browser.mouseUp', {
        ...target,
        button: args[1]
      })
    case 'wheel':
      return delegate('browser.mouseWheel', {
        ...target,
        dx: readExecNumber(readExecFlag(args, '--dx')),
        dy: readExecNumber(readExecFlag(args, '--dy')) ?? requireExecNumber(args[1])
      })
    default:
      throw new Error('browser_exec_mouse_command_unsupported')
  }
}

export function executeExecTab(
  delegate: BrowserCommandDelegate,
  target: BrowserExecTarget,
  args: string[]
): Promise<BrowserAgentCommandResult> {
  switch (args[0]) {
    case 'list':
      return delegate('browser.tabList', { worktree: target.worktree })
    case 'current':
      return delegate('browser.tabCurrent', { worktree: target.worktree })
    case 'new':
    case 'create':
      return delegate('browser.tabCreate', { url: args[1], worktree: target.worktree })
    case 'switch':
      return delegate('browser.tabSwitch', {
        ...target,
        index: readExecNumber(args[1]),
        page: readExecFlag(args, '--page')
      })
    case 'close':
      return delegate('browser.tabClose', { ...target, index: readExecNumber(args[1]) })
    default:
      throw new Error('browser_exec_tab_command_unsupported')
  }
}

export function executeExecStorage(
  delegate: BrowserCommandDelegate,
  target: BrowserExecTarget,
  args: string[]
): Promise<BrowserAgentCommandResult> {
  const kind = args[0] === 'session' ? 'session' : args[0] === 'local' ? 'local' : null
  const action = args[1]
  if (!kind || !['get', 'set', 'clear'].includes(action ?? '')) {
    throw new Error('browser_exec_storage_command_unsupported')
  }
  const input =
    action === 'clear'
      ? target
      : {
          ...target,
          key: requireExecArg(args, 2),
          ...(action === 'set' ? { value: requireExecArg(args, 3, true) } : {})
        }
  return delegate(`browser.storage.${kind}.${action}`, input)
}
