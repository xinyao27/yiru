import { win32 as pathWin32 } from 'node:path'

import { isWindowsGitBashShellPath } from '~main/git-bash'
import { removeAppImageRuntimeEnv } from '~main/pty/appimage-terminal-env'
import { isHostCodexHomeForWsl, isWslCodexHomeForHost } from '~main/pty/codex-home-wsl-env'
import {
  POWERLEVEL10K_WIZARD_DISABLE_ENV,
  seedPowerlevel10kWizardEnv
} from '~main/pty/powerlevel10k-wizard-env'
import { removeInheritedNoColor } from '~main/pty/terminal-color-env'
import { injectHistoryEnv, logHistoryInjection } from '~main/terminal-history'
import { parseWslPath } from '~main/wsl'
import { addWslEnvKeys } from '~main/wsl-env'
import { shouldUseShellReadyStartupDelivery } from '~shared/codex-startup-delivery'
import { mergeGitConfigEnvProtocol } from '~shared/git/credential-prompt-env'
import { YIRU_HERMES_STARTUP_QUERY_ENV } from '~shared/hermes-startup-query'

import {
  getAttributionShellLaunchConfig,
  getShellReadyLaunchConfig
} from '../local-pty-shell-ready'
import { resolveWindowsShellLaunchArgs } from '../windows-shell-args'
import { promoteAgentTeamsShimPath, removeUnspecifiedPaneIdentityEnv } from './environment'
import { LocalPtyProviderResolveShell } from './resolve-shell'
import type { LocalPtyEnvironmentContext, LocalPtyShellContext } from './spawn-context'

export abstract class LocalPtyProviderPrepareEnvironment extends LocalPtyProviderResolveShell {
  protected prepareLocalPtyEnvironment(context: LocalPtyShellContext): LocalPtyEnvironmentContext {
    const {
      args,
      id,
      startupAgentRecognition,
      defaultCwd,
      cwd,
      wslInfo,
      worktreeWslContext,
      preferredWslContext
    } = context
    let {
      shellPath,
      shellArgs,
      effectiveCwd,
      validationCwd,
      startupCommandDeliveredInShellArgs,
      shellReadyLaunch,
      getFallbackShellReadyConfig
    } = context
    const spawnEnv: Record<string, string> = {
      ...mergeGitConfigEnvProtocol(process.env, args.env),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Yiru',
      // Why: TUIs feature-gate on TERM_PROGRAM_VERSION (Neovim's termcap
      // autodetection, bat/delta paging hints). Sourced from YIRU_APP_VERSION
      // which main/index.ts seeds from app.getVersion() at startup; the
      // fallback keeps tests and non-Electron runs working.
      TERM_PROGRAM_VERSION: process.env.YIRU_APP_VERSION ?? '0.0.0-dev',
      // Why: opt tools (Claude Code, ls --hyperlink, etc.) into emitting OSC 8
      // hyperlinks. The `supports-hyperlinks` npm package gates on a hard-coded
      // TERM_PROGRAM allowlist (iTerm.app / WezTerm / vscode) and returns false
      // for TERM_PROGRAM=Yiru, so callers drop OSC 8 output entirely and emit
      // bare text instead. xterm.js in Yiru parses OSC 8 and the pane's
      // linkHandler routes clicks, so forcing the advertisement is safe and
      // restores clickable refs like `owner/repo#123` / `PR#123`.
      FORCE_HYPERLINK: '1'
    } as Record<string, string>
    // Why: Yiru can be launched from a Yiru terminal while developing. Pane
    // identity belongs to the child PTY, not the parent shell that spawned app.
    removeUnspecifiedPaneIdentityEnv(spawnEnv, args.env)
    removeAppImageRuntimeEnv(spawnEnv)
    removeInheritedNoColor(spawnEnv)
    for (const key of args.envToDelete ?? []) {
      delete spawnEnv[key]
    }
    if (args.env?.TERM) {
      spawnEnv.TERM = args.env.TERM
    }

    spawnEnv.LANG ??= 'en_US.UTF-8'

    // Why: On Windows, LANG alone does not control the console code page.
    // Programs like Python and Node.js check their own encoding env vars
    // independently. PYTHONUTF8=1 makes Python use UTF-8 for stdio regardless
    // of the Windows console code page, preventing garbled CJK output from
    // Python scripts run inside the terminal.
    if (process.platform === 'win32') {
      spawnEnv.PYTHONUTF8 ??= '1'
      if (isWindowsGitBashShellPath(shellPath)) {
        // Why: Git for Windows login startup files otherwise cd to $HOME,
        // ignoring node-pty's cwd for repo-scoped terminals.
        spawnEnv.CHERE_INVOKING ??= '1'
      }
    }

    const isWslShell = Boolean(wslInfo) || pathWin32.basename(shellPath).toLowerCase() === 'wsl.exe'
    const launchWslDistro =
      wslInfo?.distro ?? worktreeWslContext?.distro ?? preferredWslContext?.distro ?? null
    const finalEnv = this.opts.buildSpawnEnv
      ? this.opts.buildSpawnEnv(id, spawnEnv, {
          command: args.command,
          launchAgent: args.launchAgent,
          shellPath,
          isWsl: isWslShell,
          wslDistro: launchWslDistro
        })
      : spawnEnv
    // Why: app-level env hooks can reintroduce vars that special launch modes
    // explicitly scrubbed. Apply deletions last so shims like Claude Agent
    // Teams keep their PATH and terminal-detection contract.
    for (const key of args.envToDelete ?? []) {
      delete finalEnv[key]
    }
    if (args.env?.TERM) {
      finalEnv.TERM = args.env.TERM
    }
    if (process.platform === 'win32') {
      const codexHomeWslInfo = finalEnv.CODEX_HOME ? parseWslPath(finalEnv.CODEX_HOME) : null
      if (pathWin32.basename(shellPath).toLowerCase() === 'wsl.exe') {
        if (codexHomeWslInfo) {
          if (launchWslDistro && launchWslDistro !== codexHomeWslInfo.distro) {
            delete finalEnv.CODEX_HOME
            delete finalEnv.YIRU_CODEX_HOME
          } else {
            finalEnv.CODEX_HOME = codexHomeWslInfo.linuxPath
            finalEnv.YIRU_CODEX_HOME = codexHomeWslInfo.linuxPath
            // Why: wsl.exe only imports non-default env vars named in WSLENV.
            addWslEnvKeys(finalEnv, ['CODEX_HOME', 'YIRU_CODEX_HOME'])
            if (!launchWslDistro) {
              const resolved = resolveWindowsShellLaunchArgs(shellPath, cwd, defaultCwd, {
                distro: codexHomeWslInfo.distro
              })
              shellArgs = resolved.shellArgs
              effectiveCwd = resolved.effectiveCwd
              validationCwd = resolved.validationCwd
              startupCommandDeliveredInShellArgs =
                resolved.startupCommandDeliveredInShellArgs === true
            }
          }
        } else if (isHostCodexHomeForWsl(finalEnv.CODEX_HOME)) {
          // Why: Yiru's selected Codex runtime home is host-local. WSL Codex
          // must use its Linux-side ~/.codex instead of a Windows path.
          delete finalEnv.CODEX_HOME
          delete finalEnv.YIRU_CODEX_HOME
        } else if (finalEnv.CODEX_HOME) {
          addWslEnvKeys(finalEnv, ['CODEX_HOME', 'YIRU_CODEX_HOME'])
        }
        if (finalEnv.CLAUDE_CONFIG_DIR) {
          // Why: managed WSL Claude accounts pass a Linux CLAUDE_CONFIG_DIR
          // through Windows wsl.exe; non-default env vars need WSLENV import.
          addWslEnvKeys(finalEnv, ['CLAUDE_CONFIG_DIR'])
        }
        if (finalEnv[YIRU_HERMES_STARTUP_QUERY_ENV] !== undefined) {
          // Why: the startup wrapper expands this only inside WSL; wsl.exe
          // otherwise drops custom Windows environment variables.
          addWslEnvKeys(finalEnv, [YIRU_HERMES_STARTUP_QUERY_ENV])
        }
      } else if (codexHomeWslInfo || isWslCodexHomeForHost(finalEnv.CODEX_HOME)) {
        // Why: WSL-managed Codex homes are Linux paths. Windows Codex cannot use
        // them. YIRU_CODEX_HOME must go too because shell-ready scripts restore
        // CODEX_HOME from it after user profiles run.
        delete finalEnv.CODEX_HOME
        delete finalEnv.YIRU_CODEX_HOME
      }
    }
    seedPowerlevel10kWizardEnv(finalEnv, { envToDelete: args.envToDelete })
    if (
      finalEnv[POWERLEVEL10K_WIZARD_DISABLE_ENV] !== undefined &&
      process.platform === 'win32' &&
      pathWin32.basename(shellPath).toLowerCase() === 'wsl.exe'
    ) {
      addWslEnvKeys(finalEnv, [POWERLEVEL10K_WIZARD_DISABLE_ENV])
    }
    if (!wslInfo && process.platform !== 'win32') {
      // Why: OpenCode/Codex path restoration and OMP's typed-command status
      // wrapper need shell-ready code after user startup files run.
      const needsNoMarkerWrapper =
        finalEnv.YIRU_ATTRIBUTION_SHIM_DIR ||
        finalEnv.YIRU_OPENCODE_CONFIG_DIR ||
        finalEnv.YIRU_MIMOCODE_HOME ||
        finalEnv.YIRU_OMP_STATUS_EXTENSION ||
        finalEnv.YIRU_CODEX_HOME ||
        finalEnv.YIRU_AGENT_TEAMS_SHIM_DIR
      const isCodexStartupCommand = startupAgentRecognition?.agent === 'codex'
      let shellLaunch: ReturnType<typeof getShellReadyLaunchConfig> | null = null
      if (args.command && isCodexStartupCommand) {
        const shouldWaitForShellReady = shouldUseShellReadyStartupDelivery({
          command: args.command,
          startupCommandDelivery: args.startupCommandDelivery
        })
        // Why: payload-bearing Codex startup text can be dropped by rc-file noise;
        // plain Codex stays markerless to preserve the startup-speed path.
        getFallbackShellReadyConfig = (shell) =>
          shouldWaitForShellReady
            ? getShellReadyLaunchConfig(shell)
            : getAttributionShellLaunchConfig(shell)
        shellLaunch = shouldWaitForShellReady
          ? getShellReadyLaunchConfig(shellPath)
          : getAttributionShellLaunchConfig(shellPath)
      } else if (args.command) {
        getFallbackShellReadyConfig = (shell) => getShellReadyLaunchConfig(shell)
        shellLaunch = getShellReadyLaunchConfig(shellPath)
      } else if (needsNoMarkerWrapper) {
        getFallbackShellReadyConfig = (shell) => getAttributionShellLaunchConfig(shell)
        shellLaunch = getAttributionShellLaunchConfig(shellPath)
      } else {
        getFallbackShellReadyConfig = undefined
      }
      if (shellLaunch) {
        Object.assign(finalEnv, shellLaunch.env)
        shellArgs = shellLaunch.args ?? shellArgs
        shellReadyLaunch = args.command ? shellLaunch : null
      }
    }
    promoteAgentTeamsShimPath(finalEnv, args.env?.PATH)

    // ── Worktree-scoped shell history (§7–§10 of terminal-history-scope-design) ──
    // Why: without this, all worktree terminals share a single global HISTFILE
    // so ArrowUp in worktree B surfaces commands from worktree A.
    const worktreeId = args.worktreeId
    const historyEnabled = worktreeId && (this.opts.isHistoryEnabled?.() ?? true)
    // Resolve the effective shell kind for history injection. For WSL, the
    // outer executable is wsl.exe but the inner login shell is bash.
    const isWslTerminal =
      Boolean(wslInfo || worktreeWslContext || preferredWslContext) ||
      pathWin32.basename(shellPath).toLowerCase() === 'wsl.exe'
    const effectiveShellPath = isWslTerminal ? 'bash' : shellPath
    let historyResult: ReturnType<typeof injectHistoryEnv> | null = null
    if (historyEnabled) {
      historyResult = injectHistoryEnv(finalEnv, worktreeId, effectiveShellPath, cwd, {
        wslDistro: preferredWslContext?.distro ?? worktreeWslContext?.distro ?? null
      })
      logHistoryInjection(worktreeId, historyResult)
    }

    return {
      ...context,
      shellPath,
      shellArgs,
      effectiveCwd,
      validationCwd,
      startupCommandDeliveredInShellArgs,
      shellReadyLaunch,
      getFallbackShellReadyConfig,
      finalEnv,
      historyResult
    }
  }
}
