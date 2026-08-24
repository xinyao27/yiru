import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, win32 as pathWin32 } from 'node:path'

import {
  encodePowerShellCommand,
  getPowerShellOsc133Bootstrap,
  isPowerShellExecutableName
} from '../powershell-osc133-bootstrap'
import { getPosixOmpShellWrapper } from '../pty/omp-shell-wrapper'
import {
  getZshEnvTemplate,
  getZshFinalZdotdirRestoreBlock,
  getZshShellReadyMarkerRegistrationBlock,
  getZshStartupFileSourceBlock
} from '../shell-templates'
import { getDaemonBashShellReadyScript } from './bash-shell-ready-script'

const YIRU_USER_DATA_PATH_ENV = 'YIRU_USER_DATA_PATH'
const SHELL_READY_MARKER = '\\033]777;yiru-shell-ready\\007'

let didEnsureShellReadyWrappers = false

function getShellReadyWrapperRoot(): string {
  const userDataPath = process.env[YIRU_USER_DATA_PATH_ENV]
  // Why: older/test launchers may not seed YIRU_USER_DATA_PATH. Keep a
  // fallback so daemon startup does not fail before the parent can be fixed.
  return join(userDataPath || tmpdir(), userDataPath ? 'shell-ready' : 'yiru-shell-ready')
}

// Why: if our own process inherited ZDOTDIR from a parent shell that was
// itself a Yiru PTY (e.g. the user launched Yiru from a terminal inside a
// running Yiru), that ZDOTDIR points at a Yiru shell-ready wrapper dir.
// Propagating it as the new PTY's YIRU_ORIG_ZDOTDIR makes the wrapper's
// `source "$YIRU_ORIG_ZDOTDIR/.zshenv"` line source itself recursively —
// zsh gives "job table full or recursion limit exceeded" and the shell
// never reaches a usable prompt.
//
// Any path component ending in `/shell-ready/zsh` is a Yiru wrapper dir
// (regardless of whether it came from this daemon's userData, a packaged
// Yiru, or a different dev build). Treat it as if ZDOTDIR were unset so the
// caller falls back to HOME for the user's real config root.
function normalizeOriginalZdotdirCandidate(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  // Why: tolerate trailing slashes — some shell startup scripts export
  // `ZDOTDIR="$dir/"`, and without normalization the suffix check would
  // miss the self-loop path and restore the recursion bug. Also collapses
  // a pathological `ZDOTDIR=/` to empty so we fall back to HOME rather than
  // sourcing `/.zshenv` (which is never the user's real config).
  const normalized = value.replace(/\/+$/, '')
  if (!normalized || normalized.endsWith('/shell-ready/zsh')) {
    return null
  }
  return value
}

function resolveOriginalZdotdir(): string {
  return (
    normalizeOriginalZdotdirCandidate(process.env.ZDOTDIR) ||
    normalizeOriginalZdotdirCandidate(process.env.YIRU_ORIG_ZDOTDIR) ||
    process.env.HOME ||
    ''
  )
}

function resolveOriginalZshenvSourceDir(): string {
  return normalizeOriginalZdotdirCandidate(process.env.ZDOTDIR) || process.env.HOME || ''
}

function getRequiredShellReadyWrapperPaths(root = getShellReadyWrapperRoot()): string[] {
  return [
    join(root, 'zsh', '.zshenv'),
    join(root, 'zsh', '.zprofile'),
    join(root, 'zsh', '.zshrc'),
    join(root, 'zsh', '.zlogin'),
    join(root, 'bash', 'rcfile')
  ]
}

function shellReadyWrappersExist(): boolean {
  return getRequiredShellReadyWrapperPaths().every((path) => existsSync(path))
}

export function getDaemonZshShellReadyRcfileContent(): string {
  return `# Yiru daemon zsh shell-ready wrapper
${getZshStartupFileSourceBlock({
  fileName: '.zshrc',
  interactiveOnly: true,
  skipWhenHomeIsCurrentZdotdir: true
})}
__yiru_restore_attribution_path() {
  [[ -n "\${YIRU_ATTRIBUTION_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${YIRU_ATTRIBUTION_SHIM_DIR}"|"\${YIRU_ATTRIBUTION_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${YIRU_ATTRIBUTION_SHIM_DIR}:$PATH"
}
[[ ! -o login ]] && __yiru_restore_attribution_path
__yiru_restore_agent_teams_path() {
  [[ -n "\${YIRU_AGENT_TEAMS_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${YIRU_AGENT_TEAMS_SHIM_DIR}"|"\${YIRU_AGENT_TEAMS_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${YIRU_AGENT_TEAMS_SHIM_DIR}:$PATH"
}
[[ ! -o login ]] && __yiru_restore_agent_teams_path
if [[ ! -o login ]]; then
  # Why: ~/.zshrc can export the user's default OpenCode config after spawn.
  [[ -n "\${YIRU_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${YIRU_OPENCODE_CONFIG_DIR}"
  [[ -n "\${YIRU_MIMOCODE_HOME:-}" ]] && export MIMOCODE_HOME="\${YIRU_MIMOCODE_HOME}"
  ${getPosixOmpShellWrapper()}
  [[ -n "\${YIRU_CODEX_HOME:-}" ]] && export CODEX_HOME="\${YIRU_CODEX_HOME}"
fi
__yiru_osc133_precmd() {
  local exit_code=$?
  if [[ -n "\${__yiru_in_command:-}" ]]; then
    printf "\\033]133;D;%s\\007" "$exit_code"
    unset __yiru_in_command
  fi
  printf "\\033]133;A\\007"
}
__yiru_osc133_preexec() {
  printf "\\033]133;C\\007"
  __yiru_in_command=1
}
# Why: prepend so Yiru captures $? before user prompt hooks can overwrite it.
precmd_functions=(__yiru_osc133_precmd \${precmd_functions[@]})
preexec_functions=(__yiru_osc133_preexec \${preexec_functions[@]})
if [[ ! -o login ]]; then
${getZshFinalZdotdirRestoreBlock()}
fi
`
}

function ensureShellReadyWrappers(): void {
  if (process.platform === 'win32') {
    return
  }
  if (didEnsureShellReadyWrappers && shellReadyWrappersExist()) {
    return
  }
  didEnsureShellReadyWrappers = true

  const root = getShellReadyWrapperRoot()
  const zshDir = join(root, 'zsh')
  const bashDir = join(root, 'bash')

  const zshEnv = getZshEnvTemplate(zshDir, 'daemon')
  const zshProfile = `# Yiru daemon zsh shell-ready wrapper
${getZshStartupFileSourceBlock({ fileName: '.zprofile' })}
`
  const zshRc = getDaemonZshShellReadyRcfileContent()
  const zshLogin = `# Yiru daemon zsh shell-ready wrapper
${getZshStartupFileSourceBlock({ fileName: '.zlogin', interactiveOnly: true })}
__yiru_restore_attribution_path() {
  [[ -n "\${YIRU_ATTRIBUTION_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${YIRU_ATTRIBUTION_SHIM_DIR}"|"\${YIRU_ATTRIBUTION_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${YIRU_ATTRIBUTION_SHIM_DIR}:$PATH"
}
__yiru_restore_attribution_path
__yiru_restore_agent_teams_path() {
  [[ -n "\${YIRU_AGENT_TEAMS_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${YIRU_AGENT_TEAMS_SHIM_DIR}"|"\${YIRU_AGENT_TEAMS_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${YIRU_AGENT_TEAMS_SHIM_DIR}:$PATH"
}
__yiru_restore_agent_teams_path
# Why: .zlogin is the final login startup file before the prompt is shown.
[[ -n "\${YIRU_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${YIRU_OPENCODE_CONFIG_DIR}"
[[ -n "\${YIRU_MIMOCODE_HOME:-}" ]] && export MIMOCODE_HOME="\${YIRU_MIMOCODE_HOME}"
${getPosixOmpShellWrapper()}
[[ -n "\${YIRU_CODEX_HOME:-}" ]] && export CODEX_HOME="\${YIRU_CODEX_HOME}"
${getZshShellReadyMarkerRegistrationBlock(SHELL_READY_MARKER)}
${getZshFinalZdotdirRestoreBlock()}
`
  const bashRc = getDaemonBashShellReadyScript(SHELL_READY_MARKER)

  const files = [
    [join(zshDir, '.zshenv'), zshEnv],
    [join(zshDir, '.zprofile'), zshProfile],
    [join(zshDir, '.zshrc'), zshRc],
    [join(zshDir, '.zlogin'), zshLogin],
    [join(bashDir, 'rcfile'), bashRc]
  ] as const

  try {
    for (const [path, content] of files) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content, 'utf8')
      chmodSync(path, 0o644)
    }
  } catch (error) {
    // Why: wrapper file creation can fail due to read-only filesystems, permission
    // issues, or disk space. Rather than crashing, log the error and continue.
    // The shell will launch without the wrapper, which means no shell-ready marker
    // but at least the PTY is usable.
    const errorMessage =
      error instanceof Error
        ? `${error.message} (${(error as NodeJS.ErrnoException).code || 'unknown'})`
        : String(error)
    console.error(`[daemon/shell-ready] Failed to create wrapper files in ${root}: ${errorMessage}`)
    console.error('[daemon/shell-ready] Shell will launch without wrapper (no shell-ready marker)')
    // Reset the flag so next attempt will try again
    didEnsureShellReadyWrappers = false
  }
}

export function resolvePtyShellPath(env: Record<string, string>): string {
  if (process.platform === 'win32') {
    return env.YIRU_TERMINAL_WINDOWS_SHELL || 'powershell.exe'
  }
  return env.SHELL || process.env.SHELL || '/bin/zsh'
}

export function shellPathSupportsPtyStartupBarrier(shellPath: string): boolean {
  const shellName = pathWin32.basename(basename(shellPath)).toLowerCase()
  return shellName === 'zsh' || shellName === 'bash'
}

export function supportsPtyStartupBarrier(env: Record<string, string>): boolean {
  if (process.platform === 'win32') {
    return false
  }
  return shellPathSupportsPtyStartupBarrier(resolvePtyShellPath(env))
}

type ShellLaunchConfig = {
  args: string[] | null
  env: Record<string, string>
  supportsReadyMarker: boolean
}

function getWrappedShellLaunchConfig(
  shellPath: string,
  options: { emitReadyMarker: boolean }
): ShellLaunchConfig {
  const shellName = pathWin32.basename(basename(shellPath)).toLowerCase()

  if (shellName === 'zsh') {
    ensureShellReadyWrappers()
    const root = getShellReadyWrapperRoot()
    return {
      args: ['-l'],
      env: {
        YIRU_ORIG_ZDOTDIR: resolveOriginalZdotdir(),
        YIRU_ZSHENV_SOURCE_DIR: resolveOriginalZshenvSourceDir(),
        ZDOTDIR: join(root, 'zsh'),
        YIRU_SHELL_READY_MARKER: options.emitReadyMarker ? '1' : '0'
      },
      supportsReadyMarker: options.emitReadyMarker
    }
  }

  if (shellName === 'bash') {
    ensureShellReadyWrappers()
    const root = getShellReadyWrapperRoot()
    return {
      args: ['--rcfile', join(root, 'bash', 'rcfile')],
      env: {
        YIRU_SHELL_READY_MARKER: options.emitReadyMarker ? '1' : '0'
      },
      supportsReadyMarker: options.emitReadyMarker
    }
  }

  if (isPowerShellExecutableName(shellName)) {
    return {
      args: [
        '-NoLogo',
        '-NoExit',
        '-EncodedCommand',
        encodePowerShellCommand(getPowerShellOsc133Bootstrap())
      ],
      env: {},
      supportsReadyMarker: false
    }
  }

  return {
    args: null,
    env: {},
    supportsReadyMarker: false
  }
}

export function getShellReadyLaunchConfig(shellPath: string): ShellLaunchConfig {
  return getWrappedShellLaunchConfig(shellPath, { emitReadyMarker: true })
}

export function getAttributionShellLaunchConfig(shellPath: string): ShellLaunchConfig {
  return getWrappedShellLaunchConfig(shellPath, { emitReadyMarker: false })
}
