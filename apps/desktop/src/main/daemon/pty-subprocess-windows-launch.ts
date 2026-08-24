import { win32 as pathWin32 } from 'node:path'

import { WINDOWS_GIT_BASH_SHELL } from '@yiru/workbench-model/platform'
import { YIRU_HERMES_STARTUP_QUERY_ENV } from '~shared/hermes-startup-query'

import { isWindowsGitBashShellPath, resolveWindowsGitBashShellPath } from '../git-bash'
import {
  resolveEffectiveWindowsPowerShell,
  shouldProbeWindowsPowerShellAvailability,
  type WindowsPowerShellShellFamily
} from '../providers/windows-powershell'
import { resolveWindowsShellLaunchArgs } from '../providers/windows-shell-args'
import {
  buildWindowsPowerShellSpawnAttempts,
  type WindowsShellSpawnAttempt
} from '../providers/windows-shell-fallback-chain'
import { isHostCodexHomeForWsl, isWslCodexHomeForHost } from '../pty/codex-home-wsl-env'
import { addYiruWslInteropEnv } from '../pty/wsl-yiru-env'
import { isPwshAvailable } from '../pwsh'
import { parseWslPath } from '../wsl'
import { addWslEnvKeys } from '../wsl-env'
import { getDefaultCwd } from './pty-subprocess-preflight'
import type { PtySubprocessOptions } from './pty-subprocess-types'
import { getWslContextFromSessionId } from './wsl-session-context'

export type DaemonPtyLaunchConfig = {
  shellPath: string
  shellArgs: string[]
  spawnCwd: string
  validationCwd: string
  startupCommandDeliveredInShellArgs: boolean
  windowsFallbackAttempts: WindowsShellSpawnAttempt[]
}

function getPreferredWslContext(distro: string | null | undefined): { distro: string } | undefined {
  const trimmed = distro?.trim()
  return trimmed ? { distro: trimmed } : undefined
}

export function resolveWindowsDaemonPtyLaunch(
  options: PtySubprocessOptions,
  env: Record<string, string>,
  initialShellPath: string,
  requestedCwd: string
): DaemonPtyLaunchConfig {
  const cwdWslInfo = parseWslPath(options.cwd ?? '')
  const sessionWslContext = getWslContextFromSessionId(options.sessionId)
  const preferredWslContext = getPreferredWslContext(options.terminalWindowsWslDistro)
  let shellPath = cwdWslInfo || sessionWslContext ? 'wsl.exe' : initialShellPath
  let shellArgs: string[]
  let spawnCwd = requestedCwd
  let validationCwd = requestedCwd
  let startupCommandDeliveredInShellArgs = false

  const normalizedShellFamily = pathWin32.basename(shellPath).toLowerCase()
  const resolvedGitBashPath = resolveWindowsGitBashShellPath(shellPath)
  const resolvedShellFamily: WindowsPowerShellShellFamily =
    normalizedShellFamily === 'powershell.exe' || normalizedShellFamily === 'pwsh.exe'
      ? normalizedShellFamily
      : normalizedShellFamily === 'cmd.exe' || normalizedShellFamily === 'wsl.exe'
        ? normalizedShellFamily
        : undefined
  const shouldProbePwsh = shouldProbeWindowsPowerShellAvailability({
    shellFamily: resolvedShellFamily,
    implementation: options.terminalWindowsPowerShellImplementation
  })
  const shouldResolvePowerShellFamily =
    options.terminalWindowsPowerShellImplementation !== undefined ||
    pathWin32.basename(shellPath) === shellPath
  if (resolvedGitBashPath) {
    shellPath = resolvedGitBashPath
  } else if (shellPath === WINDOWS_GIT_BASH_SHELL) {
    shellPath = 'powershell.exe'
  } else if (shouldResolvePowerShellFamily) {
    shellPath =
      resolveEffectiveWindowsPowerShell({
        shellFamily: resolvedShellFamily,
        implementation: options.terminalWindowsPowerShellImplementation,
        pwshAvailable: shouldProbePwsh ? isPwshAvailable() : false
      }) ?? shellPath
  }

  const windowsFallbackAttempts = buildWindowsPowerShellSpawnAttempts({
    shellPath,
    cwd: spawnCwd,
    defaultCwd: getDefaultCwd(),
    wslContext: sessionWslContext ?? preferredWslContext,
    startupCommand: options.command
  })
  const primaryAttempt = windowsFallbackAttempts[0]
  if (primaryAttempt) {
    shellPath = primaryAttempt.shellPath
    shellArgs = primaryAttempt.shellArgs
    spawnCwd = primaryAttempt.effectiveCwd
    validationCwd = primaryAttempt.validationCwd
    startupCommandDeliveredInShellArgs = primaryAttempt.startupCommandDeliveredInShellArgs
  } else {
    const resolved = resolveWindowsShellLaunchArgs(
      shellPath,
      spawnCwd,
      getDefaultCwd(),
      sessionWslContext ?? preferredWslContext,
      options.command
    )
    shellArgs = resolved.shellArgs
    spawnCwd = resolved.effectiveCwd
    validationCwd = resolved.validationCwd
    startupCommandDeliveredInShellArgs = resolved.startupCommandDeliveredInShellArgs === true
  }
  if (isWindowsGitBashShellPath(shellPath)) {
    env.CHERE_INVOKING ??= '1'
  }

  const codexHomeWslInfo = env.CODEX_HOME ? parseWslPath(env.CODEX_HOME) : null
  if (pathWin32.basename(shellPath).toLowerCase() === 'wsl.exe') {
    if (codexHomeWslInfo) {
      const launchWslDistro =
        cwdWslInfo?.distro ?? sessionWslContext?.distro ?? preferredWslContext?.distro
      if (launchWslDistro && launchWslDistro !== codexHomeWslInfo.distro) {
        delete env.CODEX_HOME
        delete env.YIRU_CODEX_HOME
      } else {
        env.CODEX_HOME = codexHomeWslInfo.linuxPath
        env.YIRU_CODEX_HOME = codexHomeWslInfo.linuxPath
        addWslEnvKeys(env, ['CODEX_HOME', 'YIRU_CODEX_HOME'])
        if (!launchWslDistro) {
          const resolved = resolveWindowsShellLaunchArgs(
            shellPath,
            requestedCwd,
            getDefaultCwd(),
            { distro: codexHomeWslInfo.distro },
            options.command
          )
          shellArgs = resolved.shellArgs
          spawnCwd = resolved.effectiveCwd
          validationCwd = resolved.validationCwd
          startupCommandDeliveredInShellArgs = resolved.startupCommandDeliveredInShellArgs === true
        }
      }
    } else if (isHostCodexHomeForWsl(env.CODEX_HOME)) {
      delete env.CODEX_HOME
      delete env.YIRU_CODEX_HOME
    } else if (env.CODEX_HOME) {
      addWslEnvKeys(env, ['CODEX_HOME', 'YIRU_CODEX_HOME'])
    }
    if (env.CLAUDE_CONFIG_DIR) {
      addWslEnvKeys(env, ['CLAUDE_CONFIG_DIR'])
    }
    if (env[YIRU_HERMES_STARTUP_QUERY_ENV] !== undefined) {
      addWslEnvKeys(env, [YIRU_HERMES_STARTUP_QUERY_ENV])
    }
    addYiruWslInteropEnv(env)
  } else if (codexHomeWslInfo || isWslCodexHomeForHost(env.CODEX_HOME)) {
    delete env.CODEX_HOME
    delete env.YIRU_CODEX_HOME
  }

  return {
    shellPath,
    shellArgs,
    spawnCwd,
    validationCwd,
    startupCommandDeliveredInShellArgs,
    windowsFallbackAttempts
  }
}
