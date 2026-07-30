import {
  buildWslLoginShellCommand,
  escapeWslShCommandForWindows,
  quotePosixShell
} from '../../../shared/wsl-login-shell-command'
import { resolveCliCommand } from '../cli-command'
import { getHiddenRateLimitWslCwdSetupCommands } from '../hidden-rate-limit-pty-cwd'
import type { CursorHostRuntimeTarget } from './target'

export type CursorRuntimeCommand = {
  file: string
  args: string[]
}

function buildWslCursorCommand(
  target: Extract<CursorHostRuntimeTarget, { runtime: 'wsl' }>,
  args: string[],
  useSafeCwd: boolean
): CursorRuntimeCommand {
  const distroArgs = target.wslDistro?.trim() ? ['-d', target.wslDistro.trim()] : []
  const cursorCommand = ['cursor-agent', ...args].map(quotePosixShell).join(' ')
  const command = useSafeCwd
    ? [...getHiddenRateLimitWslCwdSetupCommands(), `exec ${cursorCommand}`].join(' && ')
    : `exec ${cursorCommand}`
  return {
    file: 'wsl.exe',
    args: [
      ...distroArgs,
      '--',
      'sh',
      '-c',
      escapeWslShCommandForWindows(buildWslLoginShellCommand(command))
    ]
  }
}

function buildHostCursorCommand(args: string[]): CursorRuntimeCommand {
  const command = resolveCliCommand('cursor-agent')
  if (process.platform !== 'win32') {
    return { file: command, args }
  }
  const cmdCommand = [`"${command}"`, ...args].join(' ')
  return { file: 'cmd.exe', args: ['/d', '/s', '/c', cmdCommand] }
}

export function buildCursorRuntimeCommand(
  target: CursorHostRuntimeTarget,
  args: string[],
  useSafeCwd: boolean
): CursorRuntimeCommand {
  return target.runtime === 'wsl'
    ? buildWslCursorCommand(target, args, useSafeCwd)
    : buildHostCursorCommand(args)
}
