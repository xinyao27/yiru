import {
  buildWslLoginShellCommand,
  escapeWslShCommandForWindows,
  quotePosixShell
} from '@yiru/runtime-protocol/workbench/wsl-login-shell-command'
import { UNTRANSLATED_GIT_OUTPUT_ENV } from '~main/git/runner/output-locale'
import { getDefaultWslDistro } from '~main/hosts/capabilities'

import { parseWslPath, type WslPathInfo } from '../../platform/wsl'
import type { ResolvedCommand } from './runner-model'

const GIT_OUTPUT_LOCALE_SHELL_PREFIX = Object.entries(UNTRANSLATED_GIT_OUTPUT_ENV)
  .map(([key, value]) => `${key}=${value}`)
  .join(' ')

/**
 * Translate any Windows-style paths in command arguments to Linux paths
 * when the command will execute inside WSL.
 *
 * Why: callers like worktree-create pass Windows paths (e.g. the workspace
 * directory) as git arguments. WSL git doesn't understand Windows paths,
 * so we must translate them. WSL UNC paths (\\wsl.localhost\...) are
 * converted to their native Linux form; regular Windows drive paths
 * (C:\Users\...) are converted to /mnt/c/Users/...
 */
function translateArgsForWsl(args: string[]): string[] {
  return args.map(translateArgForWsl)
}

function translateArgForWsl(arg: string): string {
  // WSL UNC path → native linux path
  const wslInfo = parseWslPath(arg)
  if (wslInfo) {
    return wslInfo.linuxPath
  }

  // Windows drive path (e.g. C:\Users\...) → /mnt/c/Users/...
  const driveMatch = arg.match(/^([A-Za-z]):[/\\](.*)$/)
  if (driveMatch) {
    const driveLetter = driveMatch[1].toLowerCase()
    const rest = driveMatch[2].replace(/\\/g, '/')
    return `/mnt/${driveLetter}/${rest}`
  }

  return arg
}

function hasExplicitRepoArg(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    if (
      (args[i] === '--repo' || args[i] === '-R') &&
      typeof args[i + 1] === 'string' &&
      args[i + 1].trim()
    ) {
      return true
    }
    if (args[i].startsWith('--repo=') || args[i].startsWith('-R=')) {
      return args[i].slice(args[i].indexOf('=') + 1).trim().length > 0
    }
    if (args[i].startsWith('-R') && args[i].length > 2) {
      return args[i].slice(2).trim().length > 0
    }
  }
  return false
}

function argsUseGhApiPlaceholders(args: string[]): boolean {
  return args.some(
    (arg) => arg.includes('{owner}') || arg.includes('{repo}') || arg.includes('{branch}')
  )
}

function canRunGitHubCliWithoutRepoCwd(args: string[]): boolean {
  if (hasExplicitRepoArg(args)) {
    return true
  }
  if (args[0] === 'api') {
    return !argsUseGhApiPlaceholders(args)
  }
  return args[0] === 'auth'
}

function isMissingCommandInWsl(stderr: string, command: string): boolean {
  const s = stderr.toLowerCase()
  const c = command.toLowerCase()
  return s.includes(`${c}: command not found`) || s.includes(`${c}: not found`)
}

export function canFallBackToHostGitHubCli(
  command: 'gh',
  args: string[],
  resolved: ResolvedCommand,
  stderr: string
): boolean {
  return (
    process.platform === 'win32' &&
    resolved.wsl !== null &&
    isMissingCommandInWsl(stderr, command) &&
    canRunGitHubCliWithoutRepoCwd(args)
  )
}

export function resolveHostGitHubCli(command: 'gh', args: string[]): ResolvedCommand {
  return {
    binary: command,
    args,
    // Why: host gh cannot use a WSL UNC cwd reliably. We only fall back
    // for commands with explicit repo/API context, so no repo cwd is required.
    cwd: undefined,
    wsl: null
  }
}

let defaultWslDistroOverride: string | null = null

// Why: global provider commands have no repo cwd, so follow the user's pinned
// terminal distro without coupling this low-level runner to persistence.
export function setDefaultWslDistroOverride(distro: string | null): void {
  defaultWslDistroOverride = distro
}

export function resolveDefaultWslCli(
  command: 'gh' | 'glab',
  args: string[]
): ResolvedCommand | null {
  const distro = defaultWslDistroOverride ?? getDefaultWslDistro()
  return distro ? resolveCommand(command, args, undefined, distro) : null
}

export function isHostCommandMissing(err: unknown, command: 'gh' | 'glab'): boolean {
  if (!err || typeof err !== 'object') {
    return false
  }
  const e = err as { code?: unknown; message?: unknown; syscall?: unknown; path?: unknown }
  if (e.code === 'ENOENT') {
    return true
  }
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  return (
    message.includes('enoent') &&
    (message.includes(command) || e.path === command || e.syscall === 'spawn')
  )
}

/**
 * Given a command, its arguments, and a working directory, resolve whether
 * the invocation should be routed through wsl.exe.
 *
 * Why `bash -c "cd ... && ..."` instead of `--cd`: wsl.exe's --cd flag
 * does not work reliably when invoked via Node's execFile/spawn (it fails
 * with ERROR_PATH_NOT_FOUND in some configurations). Using bash -c with
 * an explicit cd is universally supported.
 */
export function resolveCommand(
  command: string,
  args: string[],
  cwd: string | undefined,
  wslDistroOverride?: string,
  options: { useWslLoginShell?: boolean } = {}
): ResolvedCommand {
  if (process.platform !== 'win32') {
    return { binary: command, args, cwd, wsl: null }
  }

  // Why: global gh callers (rate_limit, listAccessibleProjects) have no
  // meaningful cwd to derive a WSL distro from. On WSL-only Windows setups,
  // gh.exe isn't on the host PATH and the spawn fails with ENOENT. Allow
  // callers to pass a distro hint so we can route through wsl.exe regardless.
  // Why: without a repo path or explicit override there is no deterministic
  // WSL distro fact, so global gh calls must use the Windows host PATH.
  const cwdWsl = cwd ? parseWslPath(cwd) : null
  const wsl: WslPathInfo | null =
    cwdWsl ?? (wslDistroOverride ? { distro: wslDistroOverride, linuxPath: '' } : null)
  if (!wsl) {
    return { binary: command, args, cwd, wsl: null }
  }

  const translatedArgs = translateArgsForWsl(args)
  // Why: env set on wsl.exe stays on the Windows side (WSLENV forwards only
  // named vars), so the untranslated-output locale must ride the command
  // string for git stderr parsers to work inside the distro (issue #7808).
  const localePrefix = command === 'git' ? `${GIT_OUTPUT_LOCALE_SHELL_PREFIX} ` : ''
  const escapedCommand = quotePosixShell(command)
  // Why: shell-escape each argument to prevent word splitting / glob expansion
  // inside the bash -c string. Single quotes are safe for all chars except
  // single quotes themselves, which we escape as '\'' (end quote, escaped
  // literal, reopen quote).
  const escapedArgs = translatedArgs.map(quotePosixShell)
  // Why: when cwd is supplied as a WSL UNC path, prepend `cd <linuxPath> &&`
  // so the command runs in the expected directory. When the caller only
  // supplied a distro override (no cwd), skip the cd entirely — the gh CLI
  // doesn't need a particular cwd for global calls like `api rate_limit`.
  const linuxCwd = cwdWsl?.linuxPath ?? (cwd && wslDistroOverride ? translateArgForWsl(cwd) : null)
  const shellCmd = linuxCwd
    ? `cd ${quotePosixShell(linuxCwd)} && ${localePrefix}${escapedCommand} ${escapedArgs.join(' ')}`
    : `${localePrefix}${escapedCommand} ${escapedArgs.join(' ')}`

  if (options.useWslLoginShell) {
    return {
      binary: 'wsl.exe',
      args: [
        '-d',
        wsl.distro,
        '--',
        'sh',
        '-lc',
        escapeWslShCommandForWindows(buildWslLoginShellCommand(shellCmd))
      ],
      cwd: undefined,
      wsl
    }
  }

  return {
    binary: 'wsl.exe',
    args: ['-d', wsl.distro, '--', 'bash', '-c', shellCmd],
    // Why: cwd is set to undefined because wsl.exe handles directory switching
    // via the cd inside bash -c. Setting a UNC cwd on the Node process would
    // be redundant and can cause issues with some Node internals.
    cwd: undefined,
    wsl
  }
}

// ─── Git-specific runners ───────────────────────────────────────────

// Why: Node's execFile only honors maxBuffer when it is a number — passing
// `undefined` (which happens whenever a caller omits the option) disables the
// cap entirely, so a command that prints more than V8's ~512MB max string
// length crashes the main process uncatchably inside execFile's exit handler
// (Array.join over the buffered chunks). Apply this floor so no git call can
// ever buffer without a bound.
