import { existsSync } from 'node:fs'

import { app } from 'electron'
import { resolveLocalWindowsTerminalRuntimeOptions } from '~shared/local-windows-terminal-runtime'
import { isTerminalLeafId, makePaneKey } from '~shared/stable-pane-id'
import { isValidTerminalTabId } from '~shared/terminal/tab-id'
import { isTuiAgent } from '~shared/tui-agent/config'
import { getYiruCliEnvironment, rewriteYiruCliCommandPrefix } from '~shared/yiru-cli-command-name'

import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { CLAUDE_AUTH_ENV_VARS, hasClaudeAuthEnvConflict } from '../claude/accounts/environment'
import { isClaudeAuthSwitchInProgress } from '../claude/accounts/live-pty-gate'
import { mintPtySessionId, isSafePtySessionId } from '../daemon/pty-session-id'
import { resolveLocalProjectRuntimeForWorktreeId } from '../local-project-runtime-resolution'
import { LocalPtyProvider } from '../providers/local-pty-provider'
import type { PtySpawnOptions } from '../providers/types'
import { buildPtyHostEnv } from './host-env'
import {
  promoteAgentTeamsShimPath,
  deleteRequestedEnvKeys,
  shouldSkipCodexHomeEnvForWindowsShell,
  CODEX_HOME_ENV_KEYS,
  shouldStripInheritedYiruCodexHome,
  getCodexSelectionTargetForPty,
  getCompatibleSelectedCodexHomePath,
  mergePtyEnvDeletions,
  getInheritedAgentHookEnvKeysToDelete
} from './host-env-values'
import {
  isClaudeLaunchCommand,
  routesFreshSpawnsToLocalProvider,
  beginPtySpawnForWorktree
} from './provider-lifecycle'
import type { RuntimePtySpawnArgs, RuntimePtySpawnDependencies } from './runtime-spawn-model'
import {
  ptySizes,
  paneSpawnReservationsByPaneKey,
  reservePaneSpawn,
  getProvider,
  getAppPtyId,
  getRelayPtyId,
  stripRemotePaneEnvWhenHooksDisabled
} from './runtime-state'

export async function prepareRuntimePtySpawn(
  args: RuntimePtySpawnArgs,
  deps: RuntimePtySpawnDependencies
) {
  const {
    getLocalPtyStartupPromise,
    assertFolderWorkspacePtyPathUsable,
    resolvePtySpawnStartupCwd,
    getSelectedCodexHomePath,
    getSettings,
    prepareClaudeAuth,
    store
  } = deps
  const startupPromise = getLocalPtyStartupPromise(args.connectionId)
  if (startupPromise) {
    await startupPromise
  }
  await assertFolderWorkspacePtyPathUsable(args.worktreeId)
  let startupCwdFallback: { kind: 'worktree'; cwd: string } | undefined
  const cwd = resolvePtySpawnStartupCwd(
    args.worktreeId,
    args.cwd,
    args.cwdFallback === 'worktree' && !args.connectionId
      ? {
          directoryExists: existsSync,
          onFallbackToWorkspaceRoot: (fallbackCwd) => {
            startupCwdFallback = { kind: 'worktree', cwd: fallbackCwd }
          }
        }
      : undefined
  )
  const provider = getProvider(args.connectionId)
  const isClaudeLaunch = !args.connectionId && isClaudeLaunchCommand(args.command)
  if (isClaudeLaunch && isClaudeAuthSwitchInProgress()) {
    throw new Error('A Claude account switch is in progress. Try again after it finishes.')
  }
  // Why: runtime-created terminals do not carry renderer-computed
  // projectRuntime, so resolve from worktreeId to honor project Windows runtime.
  const terminalRuntimeOptions =
    process.platform === 'win32' && !args.connectionId
      ? resolveLocalWindowsTerminalRuntimeOptions({
          requestedShellOverride: undefined,
          settings: getSettings?.(),
          projectRuntime: resolveLocalProjectRuntimeForWorktreeId(store, args.worktreeId),
          fallbackHostShell: process.env.COMSPEC || 'powershell.exe'
        })
      : { shellOverride: undefined, terminalWindowsWslDistro: null }
  const daemonShellOverride = terminalRuntimeOptions.shellOverride
  const codexSelectionTarget = getCodexSelectionTargetForPty(
    daemonShellOverride,
    cwd,
    terminalRuntimeOptions.terminalWindowsWslDistro ?? null
  )
  const claudeAuth =
    isClaudeLaunch && prepareClaudeAuth ? await prepareClaudeAuth(codexSelectionTarget) : null
  if (isClaudeLaunch && isClaudeAuthSwitchInProgress()) {
    throw new Error('A Claude account switch is in progress. Try again after it finishes.')
  }
  if (claudeAuth?.stripAuthEnv && hasClaudeAuthEnvConflict(args.env)) {
    throw new Error(
      'This Claude launch defines explicit Anthropic auth environment variables. Remove those overrides before using a managed Claude account.'
    )
  }

  const isDaemonHostSpawn =
    !args.connectionId &&
    !(provider instanceof LocalPtyProvider) &&
    !routesFreshSpawnsToLocalProvider(provider)
  const requestedSessionId = args.sessionId?.trim()
  const sessionId =
    requestedSessionId ??
    (isDaemonHostSpawn
      ? await (provider.mintAvailablePtySessionId?.(args.worktreeId) ??
          Promise.resolve(mintPtySessionId(args.worktreeId)))
      : undefined)
  const effectiveSessionRelayId =
    sessionId !== undefined ? getRelayPtyId(args.connectionId, sessionId) : undefined
  const effectiveSessionAppId =
    sessionId !== undefined ? getAppPtyId(args.connectionId, sessionId) : undefined
  const isMintedSessionId = requestedSessionId === undefined && isDaemonHostSpawn
  const shouldPersistHostSessionBinding = args.persistHostSessionBinding === true
  let hostSessionBinding: {
    store: NonNullable<typeof store>
    worktreeId: string
    tabId: string
    leafId: string
  } | null = null
  if (shouldPersistHostSessionBinding) {
    if (
      !store ||
      typeof args.worktreeId !== 'string' ||
      typeof args.tabId !== 'string' ||
      !isValidTerminalTabId(args.tabId) ||
      typeof args.leafId !== 'string' ||
      !isTerminalLeafId(args.leafId)
    ) {
      throw new Error('Cannot persist runtime PTY binding without worktreeId, tabId, and leafId')
    }
    hostSessionBinding = {
      store,
      worktreeId: args.worktreeId,
      tabId: args.tabId,
      leafId: args.leafId
    }
  }
  const sshScopedEnv = stripRemotePaneEnvWhenHooksDisabled(args.connectionId, args.env)
  let env: Record<string, string> | undefined = claudeAuth
    ? { ...sshScopedEnv, ...claudeAuth.envPatch }
    : sshScopedEnv
  const requestedAgentTeamsPath = env?.YIRU_AGENT_TEAMS_TEAM_ID ? env.PATH : undefined
  const terminalCommand =
    args.command && args.launchAgent === 'claude-agent-teams'
      ? rewriteYiruCliCommandPrefix(args.command, {
          environment: getYiruCliEnvironment(Boolean(args.connectionId) || app.isPackaged),
          executionHost: codexSelectionTarget.runtime === 'wsl' ? 'wsl' : 'native',
          platform: process.platform
        })
      : args.command
  if (args.preAllocatedHandle) {
    env = { ...env, YIRU_TERMINAL_HANDLE: args.preAllocatedHandle }
  }
  const selectedCodexHomePath = isDaemonHostSpawn
    ? getCompatibleSelectedCodexHomePath(
        codexSelectionTarget,
        getSelectedCodexHomePath?.(codexSelectionTarget, env) ?? null
      )
    : null
  const skipCodexHomeEnv =
    isDaemonHostSpawn &&
    shouldSkipCodexHomeEnvForWindowsShell(daemonShellOverride, cwd) &&
    !selectedCodexHomePath
  const stripInheritedYiruCodexHome =
    isDaemonHostSpawn &&
    shouldStripInheritedYiruCodexHome({
      target: codexSelectionTarget,
      selectedCodexHomePath,
      skipCodexHomeEnv
    })
  if (isDaemonHostSpawn && sessionId) {
    if (!isSafePtySessionId(sessionId, app.getPath('userData'))) {
      throw new Error('Invalid PTY session id')
    }
    env = buildPtyHostEnv(sessionId, env ?? {}, {
      isPackaged: app.isPackaged,
      userDataPath: app.getPath('userData'),
      selectedCodexHomePath,
      skipCodexHomeEnv,
      stripInheritedYiruCodexHome,
      githubAttributionEnabled: getSettings?.()?.enableGitHubAttribution ?? false,
      launchCommand: terminalCommand,
      launchAgent: isTuiAgent(args.launchAgent) ? args.launchAgent : undefined,
      shellPath: daemonShellOverride ?? process.env.COMSPEC,
      isWsl: shouldSkipCodexHomeEnvForWindowsShell(daemonShellOverride, cwd),
      wslDistro: codexSelectionTarget.runtime === 'wsl' ? codexSelectionTarget.wslDistro : null,
      agentStatusHooksEnabled: isAgentStatusHooksEnabled(getSettings?.()),
      networkProxySettings: getSettings?.(),
      deferGitConfigGuardToDaemon: provider.supportsGitCredentialGuardHost?.(sessionId) === true
    })
    promoteAgentTeamsShimPath(env, requestedAgentTeamsPath)
  }

  const authEnvToDelete = claudeAuth?.stripAuthEnv
    ? [...CLAUDE_AUTH_ENV_VARS, 'ANTHROPIC_CUSTOM_HEADERS']
    : undefined
  const spawnOptions: PtySpawnOptions = {
    cols: args.cols,
    rows: args.rows,
    cwd,
    env,
    ...(isMintedSessionId ? { isNewSession: true } : {})
  }
  spawnOptions.envToDelete = mergePtyEnvDeletions(
    mergePtyEnvDeletions(authEnvToDelete, args.envToDelete ?? []),
    isDaemonHostSpawn ? getInheritedAgentHookEnvKeysToDelete(env) : []
  )
  if (skipCodexHomeEnv) {
    spawnOptions.envToDelete = mergePtyEnvDeletions(spawnOptions.envToDelete, CODEX_HOME_ENV_KEYS)
  } else if (stripInheritedYiruCodexHome) {
    // Why: the persistent daemon must compare against its own inherited
    // marker; Electron cannot safely decide ownership for that process.
    spawnOptions.envToDelete = mergePtyEnvDeletions(spawnOptions.envToDelete, ['YIRU_CODEX_HOME'])
  }
  deleteRequestedEnvKeys(env, spawnOptions.envToDelete)
  promoteAgentTeamsShimPath(env, requestedAgentTeamsPath)
  if (terminalCommand !== undefined) {
    spawnOptions.command = terminalCommand
  }
  if (args.commandDelivery !== undefined) {
    spawnOptions.commandDelivery = args.commandDelivery
  }
  if (args.startupCommandDelivery !== undefined) {
    spawnOptions.startupCommandDelivery = args.startupCommandDelivery
  }
  if (isTuiAgent(args.launchAgent)) {
    spawnOptions.launchAgent = args.launchAgent
  }
  if (args.worktreeId !== undefined) {
    spawnOptions.worktreeId = args.worktreeId
  }
  const hadSessionSizeBeforeAttach =
    effectiveSessionAppId !== undefined ? ptySizes.has(effectiveSessionAppId) : false
  const sessionSizeBeforeAttach =
    effectiveSessionAppId !== undefined ? ptySizes.get(effectiveSessionAppId) : undefined
  if (sessionId !== undefined) {
    spawnOptions.sessionId = sessionId
    ptySizes.set(effectiveSessionAppId ?? sessionId, { cols: args.cols, rows: args.rows })
  }
  const materializedPaneKey = hostSessionBinding
    ? makePaneKey(hostSessionBinding.tabId, hostSessionBinding.leafId)
    : null
  const metadataLeafId =
    typeof args.leafId === 'string' && isTerminalLeafId(args.leafId) ? args.leafId : null
  const metadataPaneKey =
    typeof args.tabId === 'string' &&
    isValidTerminalTabId(args.tabId) &&
    args.tabId.length <= 512 &&
    metadataLeafId
      ? makePaneKey(args.tabId, metadataLeafId)
      : null
  const spawnIdentityPaneKey = materializedPaneKey ?? metadataPaneKey
  if (spawnIdentityPaneKey) {
    spawnOptions.paneKey = spawnIdentityPaneKey
  }
  if (typeof args.tabId === 'string' && args.tabId.length > 0 && args.tabId.length <= 512) {
    spawnOptions.tabId = args.tabId
  }
  if (process.platform === 'win32' && !args.connectionId) {
    spawnOptions.shellOverride = terminalRuntimeOptions.shellOverride
    spawnOptions.terminalWindowsWslDistro = terminalRuntimeOptions.terminalWindowsWslDistro ?? null
    spawnOptions.terminalWindowsPowerShellImplementation = getSettings
      ? (getSettings()?.terminalWindowsPowerShellImplementation ?? 'auto')
      : undefined
  }

  const existingPaneSpawn = materializedPaneKey
    ? paneSpawnReservationsByPaneKey.get(materializedPaneKey)
    : undefined
  if (existingPaneSpawn) {
    return { kind: 'existing' as const, result: await existingPaneSpawn.promise }
  }
  const finishTerminalInstall = beginPtySpawnForWorktree(args.worktreeId, cwd, args.connectionId)
  const paneSpawnReservation = materializedPaneKey ? reservePaneSpawn(materializedPaneKey) : null
  return {
    kind: 'prepared' as const,
    args,
    provider,
    cwd,
    daemonShellOverride,
    env,
    sessionId,
    effectiveSessionRelayId,
    effectiveSessionAppId,
    isMintedSessionId,
    hostSessionBinding,
    spawnOptions,
    materializedPaneKey,
    metadataLeafId,
    paneSpawnReservation,
    finishTerminalInstall,
    hadSessionSizeBeforeAttach,
    sessionSizeBeforeAttach,
    startupCwdFallback,
    isClaudeLaunch
  }
}
