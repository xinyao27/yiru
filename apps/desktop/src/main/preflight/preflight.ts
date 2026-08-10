import type { PathSource, ShellHydrationFailureReason } from '~shared/types'

import { getAzureDevOpsAuthStatus } from '../azure-devops/client'
import { getBitbucketAuthStatus } from '../bitbucket/client'
import { getGiteaAuthStatus } from '../gitea/client'
import { clearKnownHostsCache } from '../gitlab/gl-utils'
import { hydrateShellPath, mergePathSegments } from '../startup/hydrate-shell-path'
import { hydrateShellPathForAgentDetection } from './agent-detection-shell-path'
import {
  execCommandInWsl,
  execLocalPreflightCommand,
  isCommandAvailable,
  isCommandOnPath,
  shellQuote
} from './command-exec'
import { detectCommandsInInstallDirs } from './local-agent-install-dir-detection'
import { getPreflightWslTarget, type PreflightRuntimeContext } from './runtime-target'
import {
  getTuiAgentDetectionProbeCommands,
  KNOWN_TUI_AGENT_DETECTION_COMMANDS,
  resolveDetectedTuiAgentIds
} from './tui-agent-detection-commands'
import { detectWslCommandsOnPath, type WslPreflightTarget } from './wsl-agent-detection'

export type PreflightStatus = {
  git: { installed: boolean }
  gh: { installed: boolean; authenticated: boolean }
  // Why: optional so existing renderer call sites that only render git/gh
  // status keep typechecking. Consumers that surface GitLab-specific
  // affordances (the GitLab tab in the source picker, MR list, etc.)
  // gate on `glab?.authenticated`.
  glab?: { installed: boolean; authenticated: boolean }
  bitbucket?: { configured: boolean; authenticated: boolean; account: string | null }
  azureDevOps?: {
    configured: boolean
    authenticated: boolean
    account: string | null
    baseUrl: string | null
    tokenConfigured: boolean
  }
  gitea?: {
    configured: boolean
    authenticated: boolean
    account: string | null
    baseUrl: string | null
    tokenConfigured: boolean
  }
}

// Why: cache the result so repeated Landing mounts don't re-spawn processes.
// The check only runs once per app session — relaunch to re-check.
let cached: PreflightStatus | null = null

async function detectCommandRuntime(
  command: string,
  context?: PreflightRuntimeContext
): Promise<{ installed: boolean; wslTarget?: WslPreflightTarget }> {
  const wslTarget = getPreflightWslTarget(context)
  if (wslTarget) {
    return (await isCommandAvailable(command, wslTarget))
      ? { installed: true, wslTarget }
      : { installed: false }
  }
  if (await isCommandAvailable(command)) {
    return { installed: true }
  }
  return { installed: false }
}

export async function detectInstalledAgents(context?: PreflightRuntimeContext): Promise<string[]> {
  const wslTarget = getPreflightWslTarget(context)
  if (wslTarget) {
    const foundCommands = await detectWslCommandsOnPath(
      wslTarget,
      getTuiAgentDetectionProbeCommands(KNOWN_TUI_AGENT_DETECTION_COMMANDS, 'wsl')
    )
    return resolveDetectedTuiAgentIds(KNOWN_TUI_AGENT_DETECTION_COMMANDS, foundCommands, 'wsl')
  }

  const probeCommands = getTuiAgentDetectionProbeCommands(
    KNOWN_TUI_AGENT_DETECTION_COMMANDS,
    process.platform
  )
  const pathChecks = await Promise.all(
    probeCommands.map(async (cmd) => ({
      cmd,
      installedOnPath: await isCommandOnPath(cmd)
    }))
  )
  const missedCommands = pathChecks.filter((check) => !check.installedOnPath).map(({ cmd }) => cmd)
  // Why: PATH may still be unhydrated on a cold GUI launch; bulk resolution
  // computes user install dirs once instead of blocking once per missed CLI.
  const installDirCommands = detectCommandsInInstallDirs(missedCommands)
  const foundCommands = new Set(
    pathChecks
      .filter(({ cmd, installedOnPath }) => installedOnPath || installDirCommands.has(cmd))
      .map(({ cmd }) => cmd)
  )
  return resolveDetectedTuiAgentIds(
    KNOWN_TUI_AGENT_DETECTION_COMMANDS,
    foundCommands,
    process.platform
  )
}

export async function detectInstalledAgentsWithShellPathHydration(
  context?: PreflightRuntimeContext
): Promise<string[]> {
  await hydrateShellPathForAgentDetection(context)
  return detectInstalledAgents(context)
}

export type RefreshAgentsResult = {
  /** Agents detected after hydrating PATH from the user's login shell. */
  agents: string[]
  /** PATH segments that were added this refresh (empty if nothing new). */
  addedPathSegments: string[]
  /** True when the shell spawn succeeded. False = relied on existing PATH. */
  shellHydrationOk: boolean
  /** Whether `detectInstalledAgents` ran against shell-hydrated PATH or only
   *  the seed list from `patchPackagedProcessPath`. Drives the on_path:false
   *  triage in tile A on dashboard 1562016. */
  pathSource: PathSource
  /** Why hydration failed (or `'none'` on success). Typed against the shared
   *  alias so the IPC boundary stays in lockstep with the renderer-visible
   *  enum on `onboardingAgentPickedSchema`. */
  pathFailureReason: ShellHydrationFailureReason
}

/**
 * Re-spawn the user's login shell to refresh process.env.PATH, then re-run
 * agent detection. Called by the Agents settings pane when the user clicks
 * Refresh — handles the "installed a new CLI, Yiru doesn't see it yet" case
 * without requiring an app restart.
 */
export async function refreshShellPathAndDetectAgents(
  context?: PreflightRuntimeContext
): Promise<RefreshAgentsResult> {
  if (getPreflightWslTarget(context)) {
    const agents = await detectInstalledAgents(context)
    return {
      agents,
      addedPathSegments: [],
      shellHydrationOk: true,
      pathSource: 'sync_seed_only',
      pathFailureReason: 'none'
    }
  }

  const hydration = await hydrateShellPath({ force: true })
  const added = hydration.ok ? mergePathSegments(hydration.segments) : []
  const agents = await detectInstalledAgents(context)
  return {
    agents,
    addedPathSegments: added,
    shellHydrationOk: hydration.ok,
    pathSource: hydration.ok ? 'shell_hydrate' : 'sync_seed_only',
    pathFailureReason: hydration.failureReason
  }
}

// Why: kept as the fail-safe side of a passive UI poll. The only transport that
// ever answered it is gone, and an empty list is what callers already handle for
// a host that is not reachable — throwing here would spam the agent pickers.
export async function detectRemoteAgents(_args: { connectionId: string }): Promise<string[]> {
  return []
}

async function isGhAuthenticated(wslTarget?: WslPreflightTarget): Promise<boolean> {
  try {
    await (wslTarget
      ? execCommandInWsl(wslTarget, `${shellQuote('gh')} auth status`)
      : execLocalPreflightCommand('gh', ['auth', 'status']))
    // Why: for plain-text `gh auth status`, exit 0 means gh did not detect any
    // authentication issues for the checked hosts/accounts.
    return true
  } catch (error) {
    // Why: some environments may surface partial command output on the thrown
    // error object. Keep a compatibility fallback so we avoid a false auth
    // warning if success markers are present despite a non-zero result.
    const stdout = (error as { stdout?: string }).stdout ?? ''
    const stderr = (error as { stderr?: string }).stderr ?? ''
    const output = `${stdout}\n${stderr}`
    return output.includes('Logged in') || output.includes('Active account: true')
  }
}

// Why: parallel to isGhAuthenticated for the glab CLI. glab writes auth
// status to stderr in some versions and stdout in others; check both.
async function isGlabAuthenticated(wslTarget?: WslPreflightTarget): Promise<boolean> {
  try {
    await (wslTarget
      ? execCommandInWsl(wslTarget, `${shellQuote('glab')} auth status`)
      : execLocalPreflightCommand('glab', ['auth', 'status']))
    return true
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? ''
    const stderr = (error as { stderr?: string }).stderr ?? ''
    const output = `${stdout}\n${stderr}`
    return output.includes('Logged in')
  }
}

export async function runPreflightCheck(
  force = false,
  context?: PreflightRuntimeContext
): Promise<PreflightStatus> {
  const cacheable = !getPreflightWslTarget(context)
  if (cacheable && cached && !force) {
    return cached
  }

  if (force) {
    // Why: the GitLab known-hosts cache (gl-utils) is populated lazily on the
    // first GitLab request and never invalidated within a session. A user who
    // runs `glab auth login` for a self-hosted host after Yiru starts would
    // otherwise see "No GitLab project found" until app relaunch. The Re-check
    // path in IntegrationsPane forces preflight, so piggyback on that signal
    // to refresh the host list too.
    clearKnownHostsCache()
  }

  const [gitProbe, ghProbe, glabProbe] = await Promise.all([
    detectCommandRuntime('git', context),
    detectCommandRuntime('gh', context),
    detectCommandRuntime('glab', context)
  ])

  const [ghAuthenticated, glabAuthenticated, bitbucket, azureDevOps, gitea] = await Promise.all([
    ghProbe.installed ? isGhAuthenticated(ghProbe.wslTarget) : Promise.resolve(false),
    glabProbe.installed ? isGlabAuthenticated(glabProbe.wslTarget) : Promise.resolve(false),
    getBitbucketAuthStatus(),
    getAzureDevOpsAuthStatus(),
    getGiteaAuthStatus()
  ])

  const result = {
    git: { installed: gitProbe.installed },
    gh: { installed: ghProbe.installed, authenticated: ghAuthenticated },
    glab: { installed: glabProbe.installed, authenticated: glabAuthenticated },
    bitbucket,
    azureDevOps,
    gitea
  }

  if (cacheable) {
    cached = result
  }

  return result
}
