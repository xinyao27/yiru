import { delimiter } from 'node:path'

import { getCommandTokenPathBasename, getFirstCommandToken } from '~shared/command-token-scanner'
import { isWslShellName } from '~shared/local-windows-terminal-runtime'
import type { NetworkProxySettings } from '~shared/network-proxy'
import type { PiAgentKind } from '~shared/pi-agent-kind'
import type { TuiAgent } from '~shared/types'

import type { ClaudeRuntimeAuthPreparation } from '../claude/accounts/runtime-auth-service'
import type { ClaudeAccountSelectionTarget } from '../claude/accounts/runtime-selection'
import type { CodexAccountSelectionTarget } from '../codex/accounts/runtime-selection'
import { isCodexSystemDefaultRealHomeEnabled } from '../codex/real-home-flag'
import { parseWslPath } from '../wsl'
import { isHostCodexHomeForWsl, isWslCodexHomeForHost } from './codex-home-wsl-env'
import { AGENT_HOOK_RUNTIME_ENV_KEYS } from './runtime-state'
import { readShellStartupEnvVar } from './shell-startup-env'

export type BuildPtyHostEnvOptions = {
  isPackaged: boolean
  userDataPath: string
  selectedCodexHomePath: string | null
  skipCodexHomeEnv?: boolean
  /** Real-home routing strips only a Yiru-owned inherited override. */
  stripInheritedYiruCodexHome?: boolean
  githubAttributionEnabled: boolean
  /** The launch command the renderer chose for this PTY (e.g. 'pi', 'omp',
   *  'claude'). Used to resolve the per-agent managed extension target for
   *  Pi / OMP - both consume `PI_CODING_AGENT_DIR` but default to different
   *  `~/.<kind>/agent` paths. Undefined for bare-shell spawns; defaults
   *  resolve to Pi for back-compat. NEVER infer from disk presence; that's
   *  the bug this option fixes (cross-agent shadowing when both dirs exist). */
  launchCommand?: string
  /** Trusted agent identity for wrapped commands that cannot be recognized from text. */
  launchAgent?: TuiAgent
  shellPath?: string
  isWsl?: boolean
  /** Distro for WSL spawns (null = Windows default distro). Drives the WSL
   *  hook relay ensure + guest endpoint repoint; only read when isWsl. */
  wslDistro?: string | null
  agentStatusHooksEnabled: boolean
  networkProxySettings?: NetworkProxySettings
  /** Keep indexed Git config off the sparse daemon wire; the daemon appends
   *  guard entries after merging its authoritative inherited environment. */
  deferGitConfigGuardToDaemon?: boolean
}

export function readInheritedPath(baseEnv: Record<string, string>): string {
  return baseEnv.PATH ?? baseEnv.Path ?? process.env.PATH ?? process.env.Path ?? ''
}

export function firstPathEntry(pathValue: string | undefined): string | null {
  const first = pathValue?.split(delimiter).find((entry) => entry.trim().length > 0)
  return first ?? null
}

export function promoteAgentTeamsShimPath(
  env: Record<string, string> | undefined,
  requestedPath: string | undefined
): void {
  if (!env?.YIRU_AGENT_TEAMS_TEAM_ID) {
    return
  }
  const shimPath = firstPathEntry(requestedPath)
  if (!shimPath) {
    return
  }
  const currentPathKey = env.PATH !== undefined || env.Path === undefined ? 'PATH' : 'Path'
  const currentPath = env[currentPathKey] ?? ''
  const remaining = currentPath
    .split(delimiter)
    .filter((entry) => entry.length > 0 && entry !== shimPath)
  // Why: host env injection can prepend Yiru's attribution/dev shims. Claude
  // Agent Teams must still resolve our fake tmux before any real tmux.
  env[currentPathKey] = [shimPath, ...remaining].join(delimiter)
}

export function deleteRequestedEnvKeys(
  env: Record<string, string> | undefined,
  keys: string[] | undefined
): void {
  if (!env || !keys) {
    return
  }
  for (const key of keys) {
    delete env[key]
  }
}

export function shouldSkipCodexHomeEnvForWindowsShell(
  shellPath: string | undefined,
  cwd: string | undefined
): boolean {
  return isWslShellName(shellPath) || (typeof cwd === 'string' && parseWslPath(cwd) !== null)
}

export const CODEX_HOME_ENV_KEYS = ['CODEX_HOME', 'YIRU_CODEX_HOME'] as const

export function shouldStripInheritedYiruCodexHome(args: {
  target: CodexAccountSelectionTarget
  selectedCodexHomePath: string | null
  skipCodexHomeEnv: boolean
}): boolean {
  return (
    args.target.runtime === 'host' &&
    args.selectedCodexHomePath === null &&
    !args.skipCodexHomeEnv &&
    isCodexSystemDefaultRealHomeEnabled()
  )
}

export function getLocalYiruCodexHomeEnvKeysToDelete(env: Record<string, string>): string[] {
  const inheritedYiruOverride = env.YIRU_CODEX_HOME ?? process.env.YIRU_CODEX_HOME
  const inheritedCodexHome = env.CODEX_HOME ?? process.env.CODEX_HOME
  const keys = ['YIRU_CODEX_HOME']
  if (inheritedYiruOverride && inheritedCodexHome === inheritedYiruOverride) {
    keys.push('CODEX_HOME')
  }
  return keys
}

export type GetSelectedCodexHomePath = (
  target?: CodexAccountSelectionTarget,
  launchEnv?: NodeJS.ProcessEnv
) => string | null
export type PrepareClaudeAuth = (
  target?: ClaudeAccountSelectionTarget
) => Promise<ClaudeRuntimeAuthPreparation>

export function getCodexSelectionTargetForPty(
  shellPath: string | undefined,
  cwd: string | undefined,
  wslDistro?: string | null
): CodexAccountSelectionTarget {
  const wslPath = typeof cwd === 'string' ? parseWslPath(cwd) : null
  if (isWslShellName(shellPath) || wslPath) {
    return { runtime: 'wsl', wslDistro: wslPath?.distro ?? wslDistro ?? null }
  }
  return { runtime: 'host' }
}

export function getCompatibleSelectedCodexHomePath(
  target: CodexAccountSelectionTarget,
  selectedCodexHomePath: string | null
): string | null {
  if (!selectedCodexHomePath) {
    return null
  }
  const wslInfo = parseWslPath(selectedCodexHomePath)
  if (target.runtime === 'wsl') {
    return wslInfo || !isHostCodexHomeForWsl(selectedCodexHomePath) ? selectedCodexHomePath : null
  }
  return wslInfo || (process.platform === 'win32' && isWslCodexHomeForHost(selectedCodexHomePath))
    ? null
    : selectedCodexHomePath
}

export function readEnvWithProcessFallback(
  baseEnv: Record<string, string>,
  key: string
): string | undefined {
  return baseEnv[key] ?? process.env[key]
}

export function resolvePiAgentSourceDir(
  baseEnv: Record<string, string>,
  kind: PiAgentKind
): string | undefined {
  const sourceKey = kind === 'omp' ? 'YIRU_OMP_SOURCE_AGENT_DIR' : 'YIRU_PI_SOURCE_AGENT_DIR'
  const overlayKey = kind === 'omp' ? 'YIRU_OMP_CODING_AGENT_DIR' : 'YIRU_PI_CODING_AGENT_DIR'
  const otherOverlayKey = kind === 'omp' ? 'YIRU_PI_CODING_AGENT_DIR' : 'YIRU_OMP_CODING_AGENT_DIR'

  const sourceDir = readEnvWithProcessFallback(baseEnv, sourceKey)
  if (sourceDir) {
    return sourceDir
  }

  const publicDir = readEnvWithProcessFallback(baseEnv, 'PI_CODING_AGENT_DIR')
  const ownOverlayDir = readEnvWithProcessFallback(baseEnv, overlayKey)
  const otherOverlayDir = readEnvWithProcessFallback(baseEnv, otherOverlayKey)
  // Why: if PI_CODING_AGENT_DIR is just a restored Yiru overlay from either
  // kind and the matching source shadow is absent, remirroring it would leak
  // another agent's overlay tree into this launch. Fall through to defaults.
  if (publicDir && publicDir !== ownOverlayDir && publicDir !== otherOverlayDir) {
    return publicDir
  }

  return readShellStartupEnvVar(
    'PI_CODING_AGENT_DIR',
    baseEnv.HOME ?? process.env.HOME,
    baseEnv.SHELL ?? process.env.SHELL
  )
}

export function resolveScopedPiAgentSourceDir(
  baseEnv: Record<string, string>,
  kind: PiAgentKind
): string | undefined {
  const sourceKey = kind === 'omp' ? 'YIRU_OMP_SOURCE_AGENT_DIR' : 'YIRU_PI_SOURCE_AGENT_DIR'
  return readEnvWithProcessFallback(baseEnv, sourceKey)
}

export function clearPiAgentShadowEnv(baseEnv: Record<string, string>, kind: PiAgentKind): void {
  if (kind === 'omp') {
    delete baseEnv.YIRU_OMP_CODING_AGENT_DIR
    delete baseEnv.YIRU_OMP_SOURCE_AGENT_DIR
    delete baseEnv.YIRU_OMP_STATUS_EXTENSION
    return
  }
  delete baseEnv.YIRU_PI_CODING_AGENT_DIR
  delete baseEnv.YIRU_PI_SOURCE_AGENT_DIR
}

export function exposePiManagedExtensionEnv(
  baseEnv: Record<string, string>,
  kind: PiAgentKind,
  managedEnv: Record<string, string>
): void {
  if (kind === 'omp') {
    delete baseEnv.YIRU_OMP_CODING_AGENT_DIR
    if (managedEnv.YIRU_OMP_SOURCE_AGENT_DIR) {
      baseEnv.YIRU_OMP_SOURCE_AGENT_DIR = managedEnv.YIRU_OMP_SOURCE_AGENT_DIR
    } else {
      delete baseEnv.YIRU_OMP_SOURCE_AGENT_DIR
    }
    if (managedEnv.YIRU_OMP_STATUS_EXTENSION) {
      baseEnv.YIRU_OMP_STATUS_EXTENSION = managedEnv.YIRU_OMP_STATUS_EXTENSION
    } else {
      delete baseEnv.YIRU_OMP_STATUS_EXTENSION
    }
    return
  }
  delete baseEnv.YIRU_PI_CODING_AGENT_DIR
  if (managedEnv.YIRU_PI_SOURCE_AGENT_DIR) {
    baseEnv.YIRU_PI_SOURCE_AGENT_DIR = managedEnv.YIRU_PI_SOURCE_AGENT_DIR
  } else {
    delete baseEnv.YIRU_PI_SOURCE_AGENT_DIR
  }
}

export function mergePtyEnvDeletions(
  existingKeys: string[] | undefined,
  additionalKeys: readonly string[]
): string[] | undefined {
  if (!existingKeys && additionalKeys.length === 0) {
    return undefined
  }
  return Array.from(new Set([...(existingKeys ?? []), ...additionalKeys]))
}

export function getInheritedAgentHookEnvKeysToDelete(
  spawnEnv: Record<string, string> | undefined
): string[] {
  const env = spawnEnv ?? {}
  // Why: daemon/local providers merge process.env after main-process cleanup.
  // Delete reverted or unavailable hook env keys there without dropping fresh
  // receiver coordinates that buildPtyHostEnv intentionally set.
  return AGENT_HOOK_RUNTIME_ENV_KEYS.filter((key) => env[key] === undefined)
}

// Why: when agent status is disabled, a nested Yiru terminal can still pass
// through prior OpenCode or legacy Pi/OMP overlay env. Restore the user's
// original source dir when Yiru recorded one, otherwise strip only values
// known to be ours.
export function restoreOrStripOverlayEnv(
  baseEnv: Record<string, string>,
  keys: {
    primary: string
    overlay: string
    source: string
  }
): void {
  const sourceValue = baseEnv[keys.source] ?? process.env[keys.source]
  const overlayValue = baseEnv[keys.overlay] ?? process.env[keys.overlay]
  if (sourceValue) {
    baseEnv[keys.primary] = sourceValue
  } else if (overlayValue && baseEnv[keys.primary] === overlayValue) {
    delete baseEnv[keys.primary]
  }
  delete baseEnv[keys.overlay]
  delete baseEnv[keys.source]
}

export function isMimoLaunchCommand(launchCommand: string | undefined): boolean {
  const binary = getCommandTokenPathBasename(getFirstCommandToken(launchCommand ?? ''))
    .toLowerCase()
    .replace(/\.(?:cmd|exe|sh)$/, '')
  return binary === 'mimo'
}

export function resolveMimocodeSourceHome(baseEnv: Record<string, string>): string | undefined {
  const sourceHome = baseEnv.YIRU_MIMOCODE_SOURCE_HOME ?? process.env.YIRU_MIMOCODE_SOURCE_HOME
  if (sourceHome) {
    return sourceHome
  }
  const configHome = baseEnv.MIMOCODE_HOME ?? process.env.MIMOCODE_HOME
  const yiruHome = baseEnv.YIRU_MIMOCODE_HOME ?? process.env.YIRU_MIMOCODE_HOME
  if (configHome && yiruHome && configHome === yiruHome) {
    return undefined
  }
  return configHome
}

export function resolveOpenCodeSourceConfigDir(
  baseEnv: Record<string, string>
): string | undefined {
  const sourceDir =
    baseEnv.YIRU_OPENCODE_SOURCE_CONFIG_DIR ?? process.env.YIRU_OPENCODE_SOURCE_CONFIG_DIR
  if (sourceDir) {
    return sourceDir
  }

  const configDir = baseEnv.OPENCODE_CONFIG_DIR ?? process.env.OPENCODE_CONFIG_DIR
  const yiruConfigDir = baseEnv.YIRU_OPENCODE_CONFIG_DIR ?? process.env.YIRU_OPENCODE_CONFIG_DIR
  // Why: nested Yiru terminals inherit OPENCODE_CONFIG_DIR from the parent
  // PTY. If there is no recorded source dir, that value is Yiru-owned, not a
  // user config. Treating it as user config makes child Yirus mirror Yiru's
  // hook dir and can create large OpenCode runtime trees per terminal.
  if (configDir && yiruConfigDir && configDir === yiruConfigDir) {
    return undefined
  }

  return (
    configDir ??
    readShellStartupEnvVar(
      'OPENCODE_CONFIG_DIR',
      baseEnv.HOME ?? process.env.HOME,
      baseEnv.SHELL ?? process.env.SHELL
    )
  )
}
