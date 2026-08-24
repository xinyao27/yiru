import { win32 as pathWin32 } from 'node:path'

import * as pty from 'node-pty'
import {
  recognizeAgentProcessFromCommandLine,
  type RecognizedAgentProcess
} from '~shared/agent/process-recognition'

import { ensureNodePtySpawnHelperExecutable } from '../providers/local-pty-spawn'
import { wrapShellSpawnForMacosTccAttribution } from '../providers/macos-tcc-login-shell'
import { assertSafeAgentStartupCwd } from '../providers/pty-default-cwd'
import {
  POWERLEVEL10K_WIZARD_DISABLE_ENV,
  seedPowerlevel10kWizardEnv
} from '../pty/powerlevel10k-wizard-env'
import { addWslEnvKeys } from '../wsl-env'
import { promoteAgentTeamsShimPath } from './pty-subprocess-environment'
import {
  formatPtySpawnError,
  getDefaultCwd,
  preflightPosixPtySpawnEnvironment,
  preflightUnixPtySpawnEnvironment,
  preflightWindowsPtySpawnEnvironment
} from './pty-subprocess-preflight'
import type { PtySubprocessOptions } from './pty-subprocess-types'
import { resolveUnixDaemonPtyLaunch } from './pty-subprocess-unix-launch'
import {
  resolveWindowsDaemonPtyLaunch,
  type DaemonPtyLaunchConfig
} from './pty-subprocess-windows-launch'
import { resolvePtyShellPath } from './shell-ready'

export type SpawnedDaemonPty = {
  process: pty.IPty
  shellPath: string
  spawnCwd: string
  startupCommandDeliveredInShellArgs: boolean
  startupAgentRecognition: RecognizedAgentProcess | null
}

function spawnWithWindowsFallback(
  launch: DaemonPtyLaunchConfig,
  env: Record<string, string>,
  size: { cols: number; rows: number }
): Pick<SpawnedDaemonPty, 'process' | 'shellPath' | 'spawnCwd'> & {
  startupCommandDeliveredInShellArgs?: boolean
} {
  const spawnAt = (shellPath: string, shellArgs: string[], cwd: string): pty.IPty => {
    const wrapped = wrapShellSpawnForMacosTccAttribution(shellPath, shellArgs, env)
    return pty.spawn(wrapped.file, wrapped.args, {
      name: env.TERM ?? 'xterm-256color',
      cols: size.cols,
      rows: size.rows,
      cwd,
      env,
      ...(process.platform === 'win32' ? { useConptyDll: true } : {})
    })
  }

  try {
    return {
      process: spawnAt(launch.shellPath, launch.shellArgs, launch.spawnCwd),
      shellPath: launch.shellPath,
      spawnCwd: launch.spawnCwd
    }
  } catch (primaryError) {
    if (process.platform !== 'win32') {
      throw primaryError
    }
    for (const attempt of launch.windowsFallbackAttempts.slice(1)) {
      try {
        const process = spawnAt(attempt.shellPath, attempt.shellArgs, attempt.effectiveCwd)
        const message = primaryError instanceof Error ? primaryError.message : String(primaryError)
        console.warn(
          `[daemon/pty] Primary shell "${launch.shellPath}" failed (${message}), fell back to "${attempt.shellPath}"`
        )
        return {
          process,
          shellPath: attempt.shellPath,
          spawnCwd: attempt.effectiveCwd,
          startupCommandDeliveredInShellArgs: attempt.startupCommandDeliveredInShellArgs
        }
      } catch {
        // Try the next Windows fallback shell.
      }
    }
    throw primaryError
  }
}

export function spawnDaemonPty(
  options: PtySubprocessOptions,
  env: Record<string, string>,
  size: { cols: number; rows: number }
): SpawnedDaemonPty {
  const startupAgentRecognition = recognizeAgentProcessFromCommandLine(options.command)
  const requestedCwd = options.cwd || getDefaultCwd()
  if (options.command && startupAgentRecognition) {
    assertSafeAgentStartupCwd(requestedCwd, options.command)
  }
  const initialShellPath = options.shellOverride || resolvePtyShellPath(env)
  const launch =
    process.platform === 'win32'
      ? resolveWindowsDaemonPtyLaunch(options, env, initialShellPath, requestedCwd)
      : resolveUnixDaemonPtyLaunch(
          options,
          env,
          initialShellPath,
          requestedCwd,
          startupAgentRecognition?.agent === 'codex'
        )

  seedPowerlevel10kWizardEnv(env, { envToDelete: options.envToDelete })
  if (
    env[POWERLEVEL10K_WIZARD_DISABLE_ENV] !== undefined &&
    process.platform === 'win32' &&
    pathWin32.basename(launch.shellPath).toLowerCase() === 'wsl.exe'
  ) {
    addWslEnvKeys(env, [POWERLEVEL10K_WIZARD_DISABLE_ENV])
  }
  promoteAgentTeamsShimPath(env, options.env?.PATH)
  ensureNodePtySpawnHelperExecutable()
  preflightUnixPtySpawnEnvironment()
  preflightPosixPtySpawnEnvironment(launch.validationCwd)
  preflightWindowsPtySpawnEnvironment({
    validationCwd: launch.validationCwd,
    cwdWasExplicit: options.cwd !== undefined
  })

  try {
    const spawned = spawnWithWindowsFallback(launch, env, size)
    return {
      ...spawned,
      startupCommandDeliveredInShellArgs:
        spawned.startupCommandDeliveredInShellArgs ?? launch.startupCommandDeliveredInShellArgs,
      startupAgentRecognition
    }
  } catch (error) {
    if (process.platform === 'win32') {
      throw formatPtySpawnError(error, launch.shellPath, launch.spawnCwd)
    }
    throw error
  }
}
