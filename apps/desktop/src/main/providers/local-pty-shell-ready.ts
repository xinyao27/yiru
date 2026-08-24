import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, win32 as pathWin32 } from 'node:path'

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
import {
  getBashShellReadyRcfileContent,
  getZshShellReadyRcfileContent,
  resolveOriginalZdotdir,
  resolveOriginalZshenvSourceDir,
  SHELL_READY_MARKER_ESCAPED
} from './shell-ready-wrapper-content'

export {
  createShellReadyScanState,
  drainShellReadyHeldBytes,
  scanForShellReady,
  SHELL_READY_MARKER_PREFIX
} from '../shell-ready-marker-scanner'
export type { ShellReadyScanResult, ShellReadyScanState } from '../shell-ready-marker-scanner'
export {
  getBashShellReadyRcfileContent,
  getZshShellReadyRcfileContent
} from './shell-ready-wrapper-content'
export { writeStartupCommandWhenShellReady } from './startup-command-writer'
export type { ShellReadySignal } from './startup-command-writer'

export const STARTUP_COMMAND_READY_MAX_WAIT_MS = 1500

let didEnsureShellReadyWrappers = false

function getShellReadyWrapperRoot(): string {
  const userDataPath = process.env.YIRU_USER_DATA_PATH ?? tmpdir()
  return `${userDataPath}/shell-ready`
}

function getRequiredShellReadyWrapperPaths(root = getShellReadyWrapperRoot()): string[] {
  return [
    `${root}/zsh/.zshenv`,
    `${root}/zsh/.zprofile`,
    `${root}/zsh/.zshrc`,
    `${root}/zsh/.zlogin`,
    `${root}/bash/rcfile`
  ]
}

function shellReadyWrappersExist(root = getShellReadyWrapperRoot()): boolean {
  return getRequiredShellReadyWrapperPaths(root).every((path) => existsSync(path))
}

export function ensureShellReadyWrappersAt(root = getShellReadyWrapperRoot()): void {
  if (didEnsureShellReadyWrappers && shellReadyWrappersExist(root)) {
    return
  }
  didEnsureShellReadyWrappers = true
  const zshDirectory = `${root}/zsh`
  const bashDirectory = `${root}/bash`
  const zshProfile = `# Yiru zsh shell-ready wrapper
${getZshStartupFileSourceBlock({ fileName: '.zprofile' })}
`
  const zshLogin = `# Yiru zsh shell-ready wrapper
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
[[ -n "\${YIRU_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${YIRU_OPENCODE_CONFIG_DIR}"
[[ -n "\${YIRU_MIMOCODE_HOME:-}" ]] && export MIMOCODE_HOME="\${YIRU_MIMOCODE_HOME}"
${getPosixOmpShellWrapper()}
[[ -n "\${YIRU_CODEX_HOME:-}" ]] && export CODEX_HOME="\${YIRU_CODEX_HOME}"
${getZshShellReadyMarkerRegistrationBlock(SHELL_READY_MARKER_ESCAPED)}
${getZshFinalZdotdirRestoreBlock()}
`
  const files = [
    [`${zshDirectory}/.zshenv`, getZshEnvTemplate(zshDirectory)],
    [`${zshDirectory}/.zprofile`, zshProfile],
    [`${zshDirectory}/.zshrc`, getZshShellReadyRcfileContent()],
    [`${zshDirectory}/.zlogin`, zshLogin],
    [`${bashDirectory}/rcfile`, getBashShellReadyRcfileContent()]
  ] as const

  try {
    for (const [path, content] of files) {
      mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true })
      writeFileSync(path, content, 'utf8')
      chmodSync(path, 0o644)
    }
  } catch (error) {
    const code =
      error && typeof error === 'object' && typeof Reflect.get(error, 'code') === 'string'
        ? Reflect.get(error, 'code')
        : 'unknown'
    const message = error instanceof Error ? `${error.message} (${code})` : String(error)
    console.error(`[shell-ready] Failed to create wrapper files in ${root}: ${message}`)
    console.error('[shell-ready] Shell will launch without wrapper (no shell-ready marker)')
    didEnsureShellReadyWrappers = false
  }
}

function ensureShellReadyWrappers(): void {
  if (process.platform !== 'win32') {
    ensureShellReadyWrappersAt()
  }
}

export type ShellReadyLaunchConfig = {
  args: string[] | null
  env: Record<string, string>
  supportsReadyMarker: boolean
}

function getWrappedShellLaunchConfig(
  shellPath: string,
  options: { emitReadyMarker: boolean }
): ShellReadyLaunchConfig {
  const shellName = pathWin32.basename(basename(shellPath)).toLowerCase()
  if (shellName === 'zsh') {
    ensureShellReadyWrappers()
    return {
      args: ['-l'],
      env: {
        YIRU_ORIG_ZDOTDIR: resolveOriginalZdotdir(),
        YIRU_ZSHENV_SOURCE_DIR: resolveOriginalZshenvSourceDir(),
        ZDOTDIR: `${getShellReadyWrapperRoot()}/zsh`,
        YIRU_SHELL_READY_MARKER: options.emitReadyMarker ? '1' : '0'
      },
      supportsReadyMarker: options.emitReadyMarker
    }
  }
  if (shellName === 'bash') {
    ensureShellReadyWrappers()
    return {
      args: ['--rcfile', `${getShellReadyWrapperRoot()}/bash/rcfile`],
      env: { YIRU_SHELL_READY_MARKER: options.emitReadyMarker ? '1' : '0' },
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
  return { args: null, env: {}, supportsReadyMarker: false }
}

export function getShellReadyLaunchConfig(shellPath: string): ShellReadyLaunchConfig {
  return getWrappedShellLaunchConfig(shellPath, { emitReadyMarker: true })
}

export function getAttributionShellLaunchConfig(shellPath: string): ShellReadyLaunchConfig {
  return getWrappedShellLaunchConfig(shellPath, { emitReadyMarker: false })
}
