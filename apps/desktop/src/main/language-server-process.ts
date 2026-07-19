import { spawn, type ChildProcessWithoutNullStreams, type ChildProcess } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

import type { ClientChannel } from 'ssh2'

import {
  buildWslLoginShellCommand,
  escapeWslShCommandForWindows,
  quotePosixShell
} from '../shared/wsl-login-shell-command'
import { getSshConnectionManager, getActiveSshHostPlatform } from './ipc/ssh'
import type { LanguageServerWorkspace } from './language-server-workspace'
import {
  powerShellCommand,
  powerShellLiteral,
  powerShellNativeArg
} from './ssh/ssh-remote-powershell'
import { getSpawnArgsForWindows, resolveWindowsCommand } from './win32-utils'

export type LanguageServerProcess = {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  pid?: number
  started: Promise<void>
  onError: (listener: (error: Error) => void) => void
  onExit: (listener: (code: number | null, signal: string | null) => void) => void
  endInput: () => void
  terminate: (force?: boolean) => void
}

export async function spawnLanguageServerProcess(
  command: string,
  args: string[],
  workspace: LanguageServerWorkspace
): Promise<LanguageServerProcess> {
  validateLanguageServerCommand(command, workspace.host.pathFlavor)
  if (workspace.host.kind === 'ssh') {
    return spawnSshLanguageServer(command, args, workspace)
  }
  if (workspace.host.kind === 'wsl') {
    return spawnWslLanguageServer(command, args, workspace.path, workspace.host.distro)
  }
  return spawnNativeLanguageServer(command, args, workspace.path)
}

export function writeLanguageServerFrame(
  process: LanguageServerProcess,
  frame: Buffer
): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdin.write(frame, (error) => (error ? reject(error) : resolve()))
  })
}

function spawnNativeLanguageServer(
  command: string,
  args: string[],
  cwd: string
): LanguageServerProcess {
  const env = buildLanguageServerEnvironment()
  const config =
    process.platform === 'win32'
      ? getSpawnArgsForWindows(resolveWindowsCommand(command, env), args)
      : { spawnCmd: command, spawnArgs: args }
  const child = spawn(config.spawnCmd, config.spawnArgs, {
    cwd,
    detached: process.platform !== 'win32',
    env,
    stdio: 'pipe',
    windowsHide: true
  }) as ChildProcessWithoutNullStreams
  return wrapChildProcess(child)
}

function spawnWslLanguageServer(
  command: string,
  args: string[],
  cwd: string,
  distro: string
): LanguageServerProcess {
  const invocation = `cd ${quotePosixShell(cwd)} && exec ${quotePosixShell(command)} ${args.map(quotePosixShell).join(' ')}`
  const shellCommand = escapeWslShCommandForWindows(buildWslLoginShellCommand(invocation))
  const child = spawn('wsl.exe', ['-d', distro, '--', 'sh', '-lc', shellCommand], {
    env: buildLanguageServerEnvironment(),
    stdio: 'pipe',
    windowsHide: true
  }) as ChildProcessWithoutNullStreams
  return wrapChildProcess(child)
}

async function spawnSshLanguageServer(
  command: string,
  args: string[],
  workspace: LanguageServerWorkspace
): Promise<LanguageServerProcess> {
  if (workspace.host.kind !== 'ssh') {
    throw new Error('SSH language server requires an SSH workspace.')
  }
  const manager = getSshConnectionManager()
  const connection = manager?.getConnection(workspace.host.connectionId)
  const platform = getActiveSshHostPlatform(workspace.host.connectionId)
  if (!connection || connection.getState().status !== 'connected' || !platform) {
    throw new Error('The owning SSH connection is not ready.')
  }
  const remoteCommand =
    platform.commandDialect === 'powershell'
      ? powerShellCommand(
          [
            `Set-Location -LiteralPath ${powerShellLiteral(workspace.path)}`,
            `& ${powerShellLiteral(command)} ${args.map(powerShellNativeArg).join(' ')}`,
            'exit $LASTEXITCODE'
          ].join('; ')
        )
      : `cd ${quotePosixShell(workspace.path)} && exec ${quotePosixShell(command)} ${args.map(quotePosixShell).join(' ')}`
  const channel = await connection.exec(remoteCommand, {
    wrapCommand: platform.commandDialect !== 'powershell'
  })
  return wrapSshChannel(channel)
}

function wrapChildProcess(child: ChildProcessWithoutNullStreams): LanguageServerProcess {
  let exit: [number | null, string | null] | null = null
  let processError: Error | null = null
  const exitListeners = new Set<(code: number | null, signal: string | null) => void>()
  const errorListeners = new Set<(error: Error) => void>()
  child.on('exit', (code, signal) => {
    exit = [code, signal]
    for (const listener of exitListeners) {
      listener(code, signal)
    }
  })
  child.on('error', (error) => {
    processError = error
    for (const listener of errorListeners) {
      listener(error)
    }
  })
  return {
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    pid: child.pid,
    started: new Promise((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    }),
    onError: (listener) => {
      errorListeners.add(listener)
      if (processError) {
        queueMicrotask(() => listener(processError as Error))
      }
    },
    onExit: (listener) => {
      exitListeners.add(listener)
      if (exit) {
        queueMicrotask(() => listener(...(exit as [number | null, string | null])))
      }
    },
    endInput: () => child.stdin.end(),
    terminate: (force = false) => terminateChildProcess(child, force)
  }
}

function wrapSshChannel(channel: ClientChannel): LanguageServerProcess {
  let exit: [number | null, string | null] | null = null
  const exitListeners = new Set<(code: number | null, signal: string | null) => void>()
  channel.on('close', (code: number | null, signal?: string | null) => {
    exit = [code, signal ?? null]
    for (const listener of exitListeners) {
      listener(...exit)
    }
  })
  return {
    stdin: channel,
    stdout: channel,
    stderr: channel.stderr,
    started: Promise.resolve(),
    onError: (listener) => {
      channel.on('error', listener)
      channel.stderr.on('error', listener)
    },
    onExit: (listener) => {
      exitListeners.add(listener)
      if (exit) {
        queueMicrotask(() => listener(...(exit as [number | null, string | null])))
      }
    },
    endInput: () => channel.end(),
    terminate: () => channel.close()
  }
}

function terminateChildProcess(child: ChildProcess, force: boolean): void {
  if (!child.pid) {
    return
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', ...(force ? ['/f'] : [])], {
      stdio: 'ignore',
      windowsHide: true
    }).unref()
    return
  }
  try {
    process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM')
  } catch {
    child.kill(force ? 'SIGKILL' : 'SIGTERM')
  }
}

function validateLanguageServerCommand(command: string, pathFlavor: 'posix' | 'windows'): void {
  const absolute =
    pathFlavor === 'windows'
      ? /^[A-Za-z]:[\\/]/.test(command) || command.startsWith('\\\\')
      : command.startsWith('/')
  if (!absolute && /[\\/]/.test(command)) {
    throw new Error('Language server executable must be on PATH or use an absolute host path.')
  }
}

function buildLanguageServerEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    'PATH',
    'Path',
    'PATHEXT',
    'HOME',
    'USER',
    'LOGNAME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'USERNAME',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SystemRoot',
    'WINDIR',
    'APPDATA',
    'LOCALAPPDATA',
    'LANG',
    'LC_ALL',
    'XDG_CONFIG_HOME',
    'XDG_CACHE_HOME',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NODE_EXTRA_CA_CERTS'
  ]
  return Object.fromEntries(
    allowed.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]]))
  )
}
