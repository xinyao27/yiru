import { quotePosixShell } from '@yiru/runtime-protocol/workbench/wsl-login-shell-command'
import {
  appendGitConfigEnv,
  gitCredentialPromptGuardEnv
} from '~main/git/runner/credential-prompt-env'
import { UNTRANSLATED_GIT_OUTPUT_ENV } from '~main/git/runner/output-locale'

import { addWslEnvKeys } from '../../platform/wsl-env'
import { execFileCapture, DEFAULT_GIT_MAX_BUFFER } from './runner-capture'
import { resolveCommand } from './runner-command'
import type { GitExecOptions } from './runner-model'

export function gitOptionalLocksDisabledEnv(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return {
    ...env,
    GIT_OPTIONAL_LOCKS: '0'
  }
}

/**
 * Append git config entries through the GIT_CONFIG_COUNT / GIT_CONFIG_KEY_n /
 * GIT_CONFIG_VALUE_n env protocol (git >= 2.31), composing with any count
 * already present in `env` so we never clobber config a caller injected the
 * same way.
 */
export { appendGitConfigEnv }

/**
 * Pin Yiru-spawned git to untranslated English output so stderr/progress
 * parsers keep working under any user locale (issue #7808; see
 * UNTRANSLATED_GIT_OUTPUT_ENV for the full rationale). Terminal git is
 * untouched. Injected by every git runner in this module; WSL-routed spawns
 * get the same values via GIT_OUTPUT_LOCALE_SHELL_PREFIX instead.
 */
export function untranslatedGitOutputEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...env, ...UNTRANSLATED_GIT_OUTPUT_ENV }
}

export function promptGuardGitEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  return gitCredentialPromptGuardEnv(untranslatedGitOutputEnv(env), platform)
}

/**
 * Credential-prompt guard for a general-purpose shell environment (terminal
 * PTYs, hook scripts): everything promptGuardGitEnv does EXCEPT the issue-7808
 * locale pins. Those exist so Yiru can parse stderr of git it spawns itself;
 * forcing LC_ALL/LANG/LANGUAGE onto a user's shell would change the locale of
 * every child process, not just git's.
 */
export function promptGuardShellEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  return gitCredentialPromptGuardEnv(env, platform)
}

/**
 * Force git to be non-interactive so it fails fast instead of blocking forever
 * on a prompt. Without this, a git read-path call (status, worktree list, …)
 * that hits an auth/credential prompt or an SSH host-key confirmation hangs on
 * stdin with no terminal to answer it; on the headless `serve` runtime those
 * stuck calls pile up and the runtime stops answering all clients (issue #5308).
 *
 * - GIT_TERMINAL_PROMPT=0: git refuses to prompt for credentials and errors out.
 * - GIT_ASKPASS / SSH_ASKPASS: emptied when unset so no GUI/askpass helper can
 *   pop a prompt and block. A caller-provided askpass is preserved on purpose —
 *   custom askpass setups commonly *serve* credentials non-interactively, and
 *   blanking them would break those fetches.
 * - GIT_SSH_COMMAND BatchMode=yes: SSH fails instead of waiting on an
 *   interactive password/host-key prompt. BatchMode does NOT change host trust
 *   (an unknown host still errors, it just won't hang). Only added when the
 *   caller hasn't set its own GIT_SSH_COMMAND.
 */
export function nonInteractiveGitEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const next = promptGuardGitEnv(env, platform)
  if (!next.GIT_SSH_COMMAND) {
    next.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'
    if (platform === 'win32') {
      // Why: forward across the WSL boundary only when we set the value —
      // plain `ssh` resolves inside the distro, whereas a caller's
      // Windows-specific GIT_SSH_COMMAND must not leak into Linux git.
      addWslEnvKeys(next, ['GIT_SSH_COMMAND'])
    }
  }
  return next
}

type GitSshPolicyMode =
  | 'default'
  | 'explicit-env'
  | 'fallback'
  | 'configured-openssh'
  | 'configured-wrapper-passthrough'

const CORE_SSH_COMMAND_PROBE_TIMEOUT_MS = 2500

function commandBasename(command: string): string {
  const pieces = command.split(/[\\/]+/)
  return pieces.at(-1)?.toLowerCase() ?? command.toLowerCase()
}

function isMergeableOpenSshCommand(command: string): boolean {
  const basename = commandBasename(command)
  return basename === 'ssh' || basename === 'ssh.exe'
}

function shellTokenize(command: string): string[] | null {
  const tokens: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  let escaped = false

  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      const next = command[i + 1]
      if (next && /[\s'"\\]/.test(next)) {
        escaped = true
      } else {
        current += char
      }
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    if (';&|<>()`'.includes(char)) {
      return null
    }
    current += char
  }

  if (escaped || quote) {
    return null
  }
  if (current) {
    tokens.push(current)
  }
  return tokens
}

function shellQuoteToken(token: string): string {
  return /^[A-Za-z0-9_@%+=:,./~-]+$/.test(token) ? token : quotePosixShell(token)
}

function containsShellExpansionSyntax(command: string): boolean {
  return command.includes('$')
}

function withoutBatchModeOptions(tokens: string[]): string[] {
  const next: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const lower = token.toLowerCase()
    if (lower === '-o') {
      const option = tokens[i + 1]?.toLowerCase()
      if (option?.startsWith('batchmode')) {
        i += 1
        continue
      }
    }
    if (lower.startsWith('-obatchmode')) {
      continue
    }
    next.push(token)
  }
  return next
}

function buildOpenSshBatchModeCommand(configuredCommand: string): string | null {
  if (containsShellExpansionSyntax(configuredCommand)) {
    return null
  }
  const tokens = shellTokenize(configuredCommand)
  if (!tokens || tokens.length === 0 || !isMergeableOpenSshCommand(tokens[0])) {
    return null
  }
  return [...withoutBatchModeOptions(tokens), '-o', 'BatchMode=yes'].map(shellQuoteToken).join(' ')
}

export async function buildNetworkSshPolicyEnv(options: GitExecOptions): Promise<{
  env: NodeJS.ProcessEnv
  mode: GitSshPolicyMode
}> {
  const promptEnv = promptGuardGitEnv(options.env)
  if (promptEnv.GIT_SSH_COMMAND) {
    return { env: promptEnv, mode: 'explicit-env' }
  }

  const resolved = resolveCommand(
    'git',
    ['config', '--get', 'core.sshCommand'],
    options.cwd,
    options.wslDistro,
    { useWslLoginShell: Boolean(options.wslDistro) }
  )
  let configuredCommand = ''
  try {
    const { stdout } = await execFileCapture(resolved.binary, resolved.args, {
      cwd: resolved.cwd,
      encoding: 'utf-8',
      maxBuffer: DEFAULT_GIT_MAX_BUFFER,
      timeout: CORE_SSH_COMMAND_PROBE_TIMEOUT_MS,
      env: promptEnv,
      signal: options.signal
    })
    configuredCommand = String(stdout).trim()
  } catch {
    configuredCommand = ''
  }

  if (!configuredCommand) {
    const env = { ...promptEnv, GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' }
    // Why: WSL routing can come from either an explicit distro or a UNC cwd.
    if (resolved.wsl) {
      addWslEnvKeys(env, ['GIT_SSH_COMMAND'])
    }
    return { env, mode: 'fallback' }
  }

  const batchModeCommand = buildOpenSshBatchModeCommand(configuredCommand)
  if (!batchModeCommand) {
    // Why: custom wrappers are executable user policy; rewriting their argv is
    // riskier than relying on prompt guards plus the caller's target timeout.
    return { env: promptEnv, mode: 'configured-wrapper-passthrough' }
  }

  const env = { ...promptEnv, GIT_SSH_COMMAND: batchModeCommand }
  if (resolved.wsl) {
    addWslEnvKeys(env, ['GIT_SSH_COMMAND'])
  }
  return { env, mode: 'configured-openssh' }
}
