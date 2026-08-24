import { win32 as pathWin32 } from 'node:path'

import { WINDOWS_GIT_BASH_SHELL } from '@yiru/workbench-model/platform'
import { resolveWindowsGitBashShellPath } from '~main/git-bash'
import { parseWslPath } from '~main/wsl'
import { recognizeAgentProcessFromCommandLine } from '~shared/agent/process-recognition'

import type { getShellReadyLaunchConfig } from '../local-pty-shell-ready'
import { ensureNodePtySpawnHelperExecutable, validateWorkingDirectory } from '../local-pty-spawn'
import { assertSafeAgentStartupCwd } from '../pty-default-cwd'
import type { PtySpawnOptions } from '../types'
import {
  resolveEffectiveWindowsPowerShell,
  shouldProbeWindowsPowerShellAvailability,
  type WindowsPowerShellShellFamily
} from '../windows-powershell'
import { resolveWindowsShellLaunchArgs } from '../windows-shell-args'
import { buildWindowsPowerShellSpawnAttempts } from '../windows-shell-fallback-chain'
import { LocalPtyProviderContract } from './contract'
import { getDefaultCwd } from './environment'
import type { LocalPtyShellContext } from './spawn-context'
import { getWslContextFromWorktreeId, getWslContextFromPreferredDistro } from './state'

export abstract class LocalPtyProviderResolveShell extends LocalPtyProviderContract {
  protected resolveLocalPtyShell(args: PtySpawnOptions, id: string): LocalPtyShellContext {
    const startupAgentRecognition = args.command
      ? recognizeAgentProcessFromCommandLine(args.command)
      : null

    const defaultCwd = getDefaultCwd()
    const cwd = args.cwd || defaultCwd
    // Why: gate on the effective cwd (post default-cwd fallback), not the raw
    // args.cwd — an omitted cwd resolves to a safe default and must not be
    // rejected as if it were a root-like path.
    if (args.command && startupAgentRecognition) {
      assertSafeAgentStartupCwd(cwd, args.command)
    }
    const wslInfo = process.platform === 'win32' ? parseWslPath(cwd) : null
    const worktreeWslContext =
      process.platform === 'win32' ? getWslContextFromWorktreeId(args.worktreeId) : undefined
    const preferredWslContext =
      process.platform === 'win32'
        ? getWslContextFromPreferredDistro(args.terminalWindowsWslDistro)
        : undefined

    let shellPath: string
    let shellArgs: string[]
    let effectiveCwd: string
    let validationCwd: string
    let startupCommandDeliveredInShellArgs = false
    let windowsFallbackAttempts: ReturnType<typeof buildWindowsPowerShellSpawnAttempts> = []
    let shellReadyLaunch: ReturnType<typeof getShellReadyLaunchConfig> | null = null
    let getFallbackShellReadyConfig:
      | ((shell: string) => ReturnType<typeof getShellReadyLaunchConfig>)
      | undefined = undefined
    if (wslInfo) {
      shellPath = 'wsl.exe'
      const resolved = resolveWindowsShellLaunchArgs(shellPath, cwd, defaultCwd)
      shellArgs = resolved.shellArgs
      effectiveCwd = resolved.effectiveCwd
      validationCwd = resolved.validationCwd
    } else if (process.platform === 'win32') {
      // Why: shellOverride lets a single tab open in a different shell than the
      // persisted default (e.g. "New WSL terminal" from the "+" submenu) without
      // changing the user's setting. It takes priority over the setting.
      const requestedShellFamily =
        args.shellOverride ||
        this.opts.getWindowsShell?.() ||
        process.env.COMSPEC ||
        'powershell.exe'
      const shellFamily = worktreeWslContext ? 'wsl.exe' : requestedShellFamily
      const normalizedShellFamily = pathWin32.basename(shellFamily).toLowerCase()
      const resolvedGitBashPath = resolveWindowsGitBashShellPath(shellFamily)
      // Why: shell selection can arrive either as a canonical setting value
      // ('powershell.exe') or as a concrete PowerShell executable path from a
      // one-off override. Normalize both forms back to the PowerShell family so
      // the shared resolver can still fall back to inbox powershell.exe when
      // pwsh.exe was requested but is unavailable.
      const powerShellImplementation = this.opts.getWindowsPowerShellImplementation?.()
      const resolvedShellFamily: WindowsPowerShellShellFamily =
        normalizedShellFamily === 'powershell.exe' || normalizedShellFamily === 'pwsh.exe'
          ? normalizedShellFamily
          : normalizedShellFamily === 'cmd.exe' || normalizedShellFamily === 'wsl.exe'
            ? normalizedShellFamily
            : undefined
      const shouldProbePwsh = shouldProbeWindowsPowerShellAvailability({
        shellFamily: resolvedShellFamily,
        implementation: powerShellImplementation
      })
      const shouldResolvePowerShellFamily =
        powerShellImplementation !== undefined || pathWin32.basename(shellFamily) === shellFamily
      if (resolvedGitBashPath) {
        shellPath = resolvedGitBashPath
      } else if (shellFamily === WINDOWS_GIT_BASH_SHELL) {
        shellPath = 'powershell.exe'
      } else {
        shellPath = shouldResolvePowerShellFamily
          ? (resolveEffectiveWindowsPowerShell({
              shellFamily: resolvedShellFamily,
              implementation: powerShellImplementation,
              pwshAvailable: shouldProbePwsh ? (this.opts.pwshAvailable?.() ?? false) : false
            }) ?? shellFamily)
          : shellFamily
      }
      // Why: when the selected shell is a PowerShell family, resolve it to a
      // real absolute executable and build a PowerShell -> cmd.exe fallback
      // chain. Handing ConPTY a bare `pwsh.exe` lets Windows resolve it to the
      // Store App Execution Alias stub, whose spawn fails with error code 5.
      // The shared launch-args helper inside keeps both this path and the
      // daemon path producing identical args (chcp 65001 / $PROFILE / wsl cwd).
      windowsFallbackAttempts = buildWindowsPowerShellSpawnAttempts({
        shellPath,
        cwd,
        defaultCwd,
        wslContext: worktreeWslContext ?? preferredWslContext,
        startupCommand: args.command
      })
      const primaryAttempt = windowsFallbackAttempts[0]
      if (primaryAttempt) {
        shellPath = primaryAttempt.shellPath
        shellArgs = primaryAttempt.shellArgs
        effectiveCwd = primaryAttempt.effectiveCwd
        validationCwd = primaryAttempt.validationCwd
        startupCommandDeliveredInShellArgs = primaryAttempt.startupCommandDeliveredInShellArgs
      } else {
        const resolved = resolveWindowsShellLaunchArgs(
          shellPath,
          cwd,
          defaultCwd,
          worktreeWslContext ?? preferredWslContext,
          args.command
        )
        shellArgs = resolved.shellArgs
        effectiveCwd = resolved.effectiveCwd
        validationCwd = resolved.validationCwd
        startupCommandDeliveredInShellArgs = resolved.startupCommandDeliveredInShellArgs === true
      }
    } else {
      shellPath = args.env?.SHELL || process.env.SHELL || '/bin/zsh'
      shellArgs = ['-l']
      effectiveCwd = cwd
      validationCwd = cwd
    }

    ensureNodePtySpawnHelperExecutable()
    validateWorkingDirectory(validationCwd)
    return {
      args,
      id,
      startupAgentRecognition,
      defaultCwd,
      cwd,
      wslInfo,
      worktreeWslContext,
      preferredWslContext,
      shellPath,
      shellArgs,
      effectiveCwd,
      validationCwd,
      startupCommandDeliveredInShellArgs,
      windowsFallbackAttempts,
      shellReadyLaunch,
      getFallbackShellReadyConfig
    }
  }
}
