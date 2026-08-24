import { shouldUseShellReadyStartupDelivery } from '~shared/codex-startup-delivery'

import { resolveUnixShellPath } from '../providers/local-pty-spawn'
import { deleteRequestedDaemonEnvKeys } from './pty-subprocess-environment'
import type { PtySubprocessOptions } from './pty-subprocess-types'
import type { DaemonPtyLaunchConfig } from './pty-subprocess-windows-launch'
import { getAttributionShellLaunchConfig, getShellReadyLaunchConfig } from './shell-ready'

export function resolveUnixDaemonPtyLaunch(
  options: PtySubprocessOptions,
  env: Record<string, string>,
  initialShellPath: string,
  requestedCwd: string,
  isCodexStartupCommand: boolean
): DaemonPtyLaunchConfig {
  deleteRequestedDaemonEnvKeys(env, options.envToDelete)
  if (options.env?.TERM) {
    env.TERM = options.env.TERM
  }
  let shellPath = resolveUnixShellPath(initialShellPath)
  if (shellPath !== initialShellPath) {
    env.SHELL = shellPath
    console.warn(
      `[daemon/pty] Preferred shell "${initialShellPath}" is unavailable, fell back to "${shellPath}"`
    )
  }

  let shellLaunch: ReturnType<typeof getShellReadyLaunchConfig> | null = null
  if (options.command && isCodexStartupCommand) {
    const shouldWaitForShellReady = shouldUseShellReadyStartupDelivery({
      command: options.command,
      startupCommandDelivery: options.startupCommandDelivery
    })
    shellLaunch = shouldWaitForShellReady
      ? getShellReadyLaunchConfig(shellPath)
      : getAttributionShellLaunchConfig(shellPath)
  } else if (options.command) {
    shellLaunch = getShellReadyLaunchConfig(shellPath)
  } else {
    shellLaunch =
      env.YIRU_ATTRIBUTION_SHIM_DIR ||
      env.YIRU_OPENCODE_CONFIG_DIR ||
      env.YIRU_MIMOCODE_HOME ||
      env.YIRU_OMP_STATUS_EXTENSION ||
      env.YIRU_CODEX_HOME ||
      env.YIRU_AGENT_TEAMS_SHIM_DIR
        ? getAttributionShellLaunchConfig(shellPath)
        : null
  }
  if (shellLaunch) {
    Object.assign(env, shellLaunch.env)
  }
  return {
    shellPath,
    shellArgs: shellLaunch?.args ?? ['-l'],
    spawnCwd: requestedCwd,
    validationCwd: requestedCwd,
    startupCommandDeliveredInShellArgs: false,
    windowsFallbackAttempts: []
  }
}
