import { join, delimiter } from 'node:path'

import { buildConfiguredProxyEnv } from '~shared/network-proxy'
import { detectPiAgentKindFromCommand } from '~shared/pi-agent-kind'
import { resolveSetupAgentSequenceLaunchCommand } from '~shared/setup/agent-sequencing'
import { getYiruCliEnvironment, resolveYiruCliCommandName } from '~shared/yiru-cli-command-name'

import { agentHookServer } from '../agent-hooks/server'
import { wslHookRelayManager } from '../agent-hooks/wsl-hook-relay-manager'
import {
  applyTerminalAttributionEnv,
  resolveAttributionShellFamily
} from '../attribution/terminal-attribution'
import { mimoCodeHookService } from '../mimo/hook-service'
import { openCodeHookService } from '../opencode/hook-service'
import { piTitlebarExtensionService } from '../pi/titlebar-extension-service'
import type { BuildPtyHostEnvOptions } from './host-env-values'
import {
  readInheritedPath,
  getLocalYiruCodexHomeEnvKeysToDelete,
  resolvePiAgentSourceDir,
  resolveScopedPiAgentSourceDir,
  clearPiAgentShadowEnv,
  exposePiManagedExtensionEnv,
  restoreOrStripOverlayEnv,
  isMimoLaunchCommand,
  resolveMimocodeSourceHome,
  resolveOpenCodeSourceConfigDir
} from './host-env-values'
import { AGENT_HOOK_RUNTIME_ENV_KEYS } from './runtime-state'
import { applyTerminalGitCredentialPromptGuard } from './terminal-git-credential-guard'
import { mergePersistedWindowsPath } from './windows-environment-path'

/**
 * Mutates `baseEnv` in place with all host-local PTY env vars and returns it.
 *
 * This is the single source of truth for the env shape a Yiru PTY needs
 * BEFORE the provider-specific wrapper (LocalPtyProvider's TERM/LANG defaults,
 * DaemonPtyAdapter's subprocess env). Callers are responsible for the SSH
 * guard — if `args.connectionId` is set, do NOT call this function, because
 * every injection here is either host-loopback (hook server, attribution
 * shims) or references paths on the local filesystem that would be meaningless
 * to a remote shell.
 */
export function buildPtyHostEnv(
  id: string,
  baseEnv: Record<string, string>,
  opts: BuildPtyHostEnvOptions
): Record<string, string> {
  mergePersistedWindowsPath(baseEnv)
  Object.assign(baseEnv, buildConfiguredProxyEnv(opts.networkProxySettings))

  // Why: the Local path passes a baseEnv that already includes process.env
  // (LocalPtyProvider.spawn merges it before calling buildSpawnEnv). The
  // daemon path passes only args.env since process.env propagates to the
  // daemon subprocess via fork inheritance, not the IPC wire. Checking both
  // sources when reading a potentially-user-provided value keeps the guards
  // in lock-step across spawn paths without pushing process.env onto the
  // IPC wire unnecessarily.
  const preexistingOpenCodeConfigDir = resolveOpenCodeSourceConfigDir(baseEnv)
  const launchCommandHint = resolveSetupAgentSequenceLaunchCommand(baseEnv, opts.launchCommand)
  const piAgentKind = detectPiAgentKindFromCommand(launchCommandHint)
  const hasLaunchCommand =
    typeof launchCommandHint === 'string' && launchCommandHint.trim().length > 0

  // Why: unattended agents must fail instead of opening OS credential UI and
  // retrying auth in a loop; ordinary user terminals keep normal Git behavior.
  applyTerminalGitCredentialPromptGuard(baseEnv, {
    launchCommand: launchCommandHint,
    isUnattended: opts.launchAgent !== undefined,
    deferGitConfigGuardToHost: opts.deferGitConfigGuardToDaemon
  })

  const shouldPrepareOmpShadow = piAgentKind === 'omp' || !hasLaunchCommand
  // Why: source shadows are agent-scoped. Trusting the other kind's source
  // would reintroduce the exact Pi/OMP extension-state shadowing this PR fixes.
  const preexistingPiAgentDir = resolvePiAgentSourceDir(baseEnv, 'pi')
  const preexistingOmpAgentDir =
    piAgentKind === 'omp'
      ? resolvePiAgentSourceDir(baseEnv, 'omp')
      : resolveScopedPiAgentSourceDir(baseEnv, 'omp')

  if (opts.agentStatusHooksEnabled) {
    // Why: OPENCODE_CONFIG_DIR is a singular path, not a colon-list, so a user
    // value cannot coexist with a Yiru-only injection. Hand the user's value
    // (when present) to the hook service and let it materialize a source-scoped
    // mirror overlay that lets the user's plugins and Yiru's status plugin
    // load together. See docs/opencode-config-dir-collision.md.
    Object.assign(baseEnv, openCodeHookService.buildPtyEnv(id, preexistingOpenCodeConfigDir))
    if (baseEnv.OPENCODE_CONFIG_DIR) {
      // Why: ~/.zshrc can re-export the user's default after spawn; shell-ready
      // wrappers restore this PTY-scoped value after user startup files run.
      baseEnv.YIRU_OPENCODE_CONFIG_DIR = baseEnv.OPENCODE_CONFIG_DIR
      if (preexistingOpenCodeConfigDir) {
        // Why: terminals launched from another Yiru terminal inherit the overlay
        // as OPENCODE_CONFIG_DIR; keep the original source so overlays do not
        // mirror overlays and drop the user's real config.
        baseEnv.YIRU_OPENCODE_SOURCE_CONFIG_DIR = preexistingOpenCodeConfigDir
      } else {
        delete baseEnv.YIRU_OPENCODE_SOURCE_CONFIG_DIR
      }
    }
    if (isMimoLaunchCommand(launchCommandHint)) {
      const preexistingMimocodeHome = resolveMimocodeSourceHome(baseEnv)
      Object.assign(baseEnv, mimoCodeHookService.buildPtyEnv(id, preexistingMimocodeHome))
      if (baseEnv.MIMOCODE_HOME) {
        baseEnv.YIRU_MIMOCODE_HOME = baseEnv.MIMOCODE_HOME
        if (preexistingMimocodeHome) {
          baseEnv.YIRU_MIMOCODE_SOURCE_HOME = preexistingMimocodeHome
        } else {
          delete baseEnv.YIRU_MIMOCODE_SOURCE_HOME
        }
      }
    }
  } else {
    restoreOrStripOverlayEnv(baseEnv, {
      primary: 'OPENCODE_CONFIG_DIR',
      overlay: 'YIRU_OPENCODE_CONFIG_DIR',
      source: 'YIRU_OPENCODE_SOURCE_CONFIG_DIR'
    })
    restoreOrStripOverlayEnv(baseEnv, {
      primary: 'MIMOCODE_HOME',
      overlay: 'YIRU_MIMOCODE_HOME',
      source: 'YIRU_MIMOCODE_SOURCE_HOME'
    })
  }

  // Why: Claude/Codex native hooks run inside the shell process, so Yiru
  // must inject the loopback receiver coordinates before the agent starts.
  // Without these env vars the global hook config cannot map callbacks back
  // to the correct Yiru pane.
  // Why: nested Yiru terminals can inherit another process's hook endpoint or
  // token. Strip all hook runtime coordinates before injecting this PTY's fresh
  // server values so callbacks route to the owning app/runtime.
  for (const key of AGENT_HOOK_RUNTIME_ENV_KEYS) {
    delete baseEnv[key]
  }
  if (opts.agentStatusHooksEnabled) {
    Object.assign(baseEnv, agentHookServer.buildPtyEnv())
    if (opts.isWsl === true) {
      // Why: hook POSTs to 127.0.0.1 die inside WSL's NAT namespace. Ensure
      // the guest-resident relay for this distro (covers fresh spawns and
      // post-restart reattach re-spawns), and once the relay has reported the
      // guest home, point restart re-coordination at the relay-written
      // guest-side endpoint file instead of the /p-translated Windows one.
      const distro = opts.wslDistro ?? null
      wslHookRelayManager.ensureForDistro(distro)
      const guestEndpoint = wslHookRelayManager.getGuestEndpointFilePath(distro)
      if (guestEndpoint) {
        baseEnv.YIRU_AGENT_HOOK_ENDPOINT = guestEndpoint
      }
    }
  }

  // Why: PI_CODING_AGENT_DIR owns Pi's / OMP's full config/session root. Keep
  // that home as the user's normal source of truth and install only Yiru-owned,
  // env-guarded extension files into the selected agent's extension dir.
  if (opts.agentStatusHooksEnabled) {
    clearPiAgentShadowEnv(baseEnv, 'pi')
    clearPiAgentShadowEnv(baseEnv, 'omp')
    if (piAgentKind === 'pi') {
      const piEnv = piTitlebarExtensionService.buildPtyEnv(id, preexistingPiAgentDir, 'pi')
      Object.assign(baseEnv, piEnv)
      exposePiManagedExtensionEnv(baseEnv, 'pi', piEnv)
    }

    if (shouldPrepareOmpShadow) {
      const ompEnv = piTitlebarExtensionService.buildPtyEnv(id, preexistingOmpAgentDir, 'omp')
      Object.assign(baseEnv, ompEnv)
      exposePiManagedExtensionEnv(baseEnv, 'omp', ompEnv)
    }
  } else {
    // Why: when agent status is disabled we must strip BOTH kinds' shadow vars
    // so a nested PTY does not inherit a stale overlay from either agent.
    restoreOrStripOverlayEnv(baseEnv, {
      primary: 'PI_CODING_AGENT_DIR',
      overlay: 'YIRU_PI_CODING_AGENT_DIR',
      source: 'YIRU_PI_SOURCE_AGENT_DIR'
    })
    restoreOrStripOverlayEnv(baseEnv, {
      primary: 'PI_CODING_AGENT_DIR',
      overlay: 'YIRU_OMP_CODING_AGENT_DIR',
      source: 'YIRU_OMP_SOURCE_AGENT_DIR'
    })
    delete baseEnv.YIRU_OMP_STATUS_EXTENSION
  }

  // Why: Codex account switching now materializes auth into a Yiru-scoped
  // runtime home, and Codex launched inside Yiru terminals must use that same
  // prepared home as quota fetches and other entry points. Keep the override
  // PTY-scoped so dev/prod Yirus do not share hooks through ~/.codex.
  if (opts.skipCodexHomeEnv) {
    delete baseEnv.CODEX_HOME
    delete baseEnv.YIRU_CODEX_HOME
  } else if (opts.selectedCodexHomePath) {
    baseEnv.CODEX_HOME = opts.selectedCodexHomePath
    // Why: user startup files may re-export CODEX_HOME; shell-ready wrappers
    // restore this runtime home before Codex can be launched from the prompt.
    baseEnv.YIRU_CODEX_HOME = opts.selectedCodexHomePath
  } else if (opts.stripInheritedYiruCodexHome) {
    // Why: nested Yiru panes inherit the private marker; a user-owned custom
    // CODEX_HOME has no matching marker and must survive real-home routing.
    for (const key of getLocalYiruCodexHomeEnvKeysToDelete(baseEnv)) {
      delete baseEnv[key]
    }
  }

  // Why: every Yiru-owned terminal carries an exact runtime identity. Replacing
  // inherited values prevents a production PTY opened from a dev shell (or the
  // inverse) from reusing the other app's metadata, daemon socket, or CLI.
  baseEnv.YIRU_USER_DATA_PATH = opts.userDataPath
  const cliEnvironment = getYiruCliEnvironment(opts.isPackaged)
  baseEnv.YIRU_CLI_ENVIRONMENT = cliEnvironment
  baseEnv.YIRU_CLI_COMMAND = resolveYiruCliCommandName({
    environment: cliEnvironment,
    executionHost: opts.isWsl ? 'wsl' : 'native',
    platform: process.platform
  })
  // Why: dev mode needs its launcher on PATH for the resolved `yiru-dev`
  // command; the directory intentionally contains no production-name alias.
  if (!opts.isPackaged) {
    const devCliBin = join(opts.userDataPath, 'cli', 'bin')
    const inheritedPath = readInheritedPath(baseEnv)
    // Why: avoid a trailing delimiter when PATH is empty — some shells
    // treat an empty segment as `.`, which would let commands resolve from
    // the current working directory (a foot-gun we don't want to create
    // for dev terminals).
    baseEnv.PATH = inheritedPath ? `${devCliBin}${delimiter}${inheritedPath}` : devCliBin
  }

  // Why: GitHub attribution should only affect commands launched from
  // Yiru's own PTYs. Injecting lightweight PATH shims at spawn-time keeps
  // the behavior local to Yiru instead of rewriting user git config or
  // touching external shells.
  if (!opts.githubAttributionEnabled) {
    delete baseEnv.YIRU_ENABLE_GIT_ATTRIBUTION
    delete baseEnv.YIRU_GIT_COMMIT_TRAILER
    delete baseEnv.YIRU_GH_PR_FOOTER
    delete baseEnv.YIRU_ATTRIBUTION_SHIM_DIR
  }
  applyTerminalAttributionEnv(baseEnv, {
    enabled: opts.githubAttributionEnabled,
    userDataPath: opts.userDataPath,
    shellFamily: resolveAttributionShellFamily({
      shellPath: opts.shellPath,
      isWsl: opts.isWsl
    })
  })

  return baseEnv
}
