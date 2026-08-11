import { ORPCError } from '@orpc/client'
import type { ContractRouterClient, runtimeContract } from '@yiru/runtime-protocol/contract'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { STATUS_GET_CONTRACT } from '@yiru/runtime-protocol/status'
/* eslint-disable max-lines -- Why: the web preload adapter is the browser-side
   replacement for Electron preload, so the compatibility surface is necessarily
   centralized at this boundary. */
import type { PreloadApi } from '@yiru/shared/preload/api-types'
import type { AiVaultListArgs, AiVaultListResult } from '@yiru/workbench-model/agent'
import { relativePathInsideRoot } from '@yiru/workbench-model/platform'
import {
  applyPRBotAuthorOverride,
  normalizePRBotAuthorOverrides
} from '@yiru/workbench-model/review'
import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostScope,
  normalizeExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'
import { getDefaultCreateProjectParent } from '~renderer/components/sidebar/create-project-defaults'
import { translate } from '~renderer/i18n/i18n'
import { normalizeAutoRenameBranchFromWorkDefaultOn } from '~shared/auto-rename-branch-from-work-settings'
import {
  getDefaultOnboardingState,
  getDefaultSettings,
  getDefaultWorkspaceSession,
  ONBOARDING_FLOW_VERSION
} from '~shared/constants'
import {
  findKeybindingConflicts,
  formatKeybindingList,
  getKeybindingPlatform,
  isKeybindingActionId,
  normalizeKeybindingArrayForAction,
  type KeybindingActionId,
  type KeybindingFileDiagnostic,
  type KeybindingFileSnapshot,
  type KeybindingOverrides,
  type KeybindingPlatform
} from '~shared/keybindings'
import { EMPTY_PTY_MAIN_DELIVERY_DIAGNOSTICS } from '~shared/pty-delivery-diagnostics'
import type { RuntimeStatus, RuntimeSyncWindowGraph } from '~shared/runtime-types'
import { normalizeTerminalCursorStyleDefault } from '~shared/terminal/cursor-style-settings'
import { normalizeTerminalCustomThemes } from '~shared/terminal/custom-themes'
import {
  normalizeTuiAgentArgsRecord,
  normalizeTuiAgentEnvRecord
} from '~shared/tui-agent/launch-defaults'
import { normalizeDisabledTuiAgents } from '~shared/tui-agent/selection'
import type {
  DetectedWorktreeListResult,
  GlobalSettings,
  OnboardingState,
  PRInfo,
  Worktree,
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '~shared/types'
import { normalizeUiLanguage } from '~shared/ui-language'
import {
  createDefaultLocalYiruProfile,
  DEFAULT_LOCAL_YIRU_PROFILE_ID,
  type FindYiruProfileProjectsByPathResult,
  type TransferYiruProfileProjectArgs
} from '~shared/yiru-profiles'

import type { ShellNotificationsApi } from '../runtime/shell-notifications-client'
import type {
  ShellAppApi,
  ShellGitHubApi,
  ShellRepoHostApi,
  ShellRuntimeStateApi,
  ShellStarNagApi,
  ShellUpdaterApi
} from '../runtime/shell-system-client'
import { readWebUIState } from '../runtime/web-ui-state'
import { toRuntimeWorktreeSelector } from '../runtime/worktree-selector'
import {
  isLegacyBackgroundRuntimeMethod,
  type WebRuntimeOrpcClientContext
} from './legacy-orpc-link'
import { WebRuntimeCallQueuePool, type WebRuntimeCallPriority } from './runtime-call-queue'
import { WebRuntimeClient } from './runtime-client'
import { createRuntimeStreamFanOut } from './runtime-client-events'
import {
  clearStoredWebRuntimeEnvironment,
  getPreferredWebPairingOffer,
  readStoredWebRuntimeEnvironment,
  redactStoredWebRuntimeEnvironment,
  updateStoredEnvironmentRuntimeId,
  type StoredWebRuntimeEnvironment
} from './runtime-environment'
import { sanitizeWebRuntimeWorkspaceSession } from './workspace-session'

const SETTINGS_STORAGE_KEY = 'yiru.web.settings.v1'
const SESSION_STORAGE_KEY = 'yiru.web.workspaceSession.v1'
const ONBOARDING_STORAGE_KEY = 'yiru.web.onboarding.v1'
const GITHUB_CACHE_STORAGE_KEY = 'yiru.web.githubCache.v1'
const KEYBINDINGS_STORAGE_KEY = 'yiru.web.keybindings.v1'
// Why: browser-paired clients need desktop parity for large dev sessions; the
// runtime's no-limit default remains capped for lower-level RPC callers.
const WEB_RUNTIME_WORKTREE_LIST_LIMIT = 10_000

let activeEnvironment: StoredWebRuntimeEnvironment | null = readStoredWebRuntimeEnvironment()
let activeClient: WebRuntimeClient | null = null
let activeClientEnvironmentId: string | null = null

// One host-event stream shared by every `on*` adapter that needs it. Resolves
// lazily so it stays dormant until a runtime is actually paired.
const resolveFanOutClient = async (): Promise<WebRuntimeOrpcClient | null> => {
  const environment = requireActiveEnvironmentOrNull()
  return environment ? await getClientForEnvironment(environment).getOrpcClient() : null
}

const runtimeClientEvents = createRuntimeStreamFanOut({
  resolveClient: resolveFanOutClient,
  open: (client, signal) => client.runtime.clientEvents.subscribe(undefined, { signal })
})

let cachedDetectedWorktrees: { loadedAt: number; worktrees: Worktree[] } | null = null
const runtimeCallQueuePool = new WebRuntimeCallQueuePool()

type WebRuntimeOrpcClient = ContractRouterClient<typeof runtimeContract>
type WebRuntimeProcedure<TResult> = (
  client: WebRuntimeOrpcClient,
  options: { signal: AbortSignal }
) => Promise<TResult>
type SelectedWebRuntimeProcedure<TInput, TResult> = (
  input: TInput,
  options?: { signal?: AbortSignal }
) => Promise<TResult>
type WebRuntimeProcedureOptions = {
  environment?: StoredWebRuntimeEnvironment
  priority?: WebRuntimeCallPriority
  signal?: AbortSignal
  timeoutMs?: number
}

function invalidateRuntimeWorktreeCaches(): void {
  cachedDetectedWorktrees = null
}

type WebKeybindingsApi = {
  get: () => Promise<KeybindingFileSnapshot>
  ensureFile: () => Promise<KeybindingFileSnapshot>
  setAction: (args: {
    actionId: KeybindingActionId
    bindings: string[] | null
  }) => Promise<KeybindingFileSnapshot>
  reload: () => Promise<KeybindingFileSnapshot>
  openFile: () => Promise<KeybindingFileSnapshot>
  revealFile: () => Promise<KeybindingFileSnapshot>
  onChanged: (callback: (snapshot: KeybindingFileSnapshot) => void) => () => void
}
type WebGitHubApi = ShellGitHubApi
type WebRuntimeProcedureSelector = (client: WebRuntimeOrpcClient) => unknown
type WebKeybindingDocument = {
  version: 1
  keybindings: KeybindingOverrides
  platforms: Partial<Record<KeybindingPlatform, KeybindingOverrides>>
}

const GIT_PATH_MUTATION_SELECTORS = {
  stage: (client: WebRuntimeOrpcClient) => client.git.stage,
  unstage: (client: WebRuntimeOrpcClient) => client.git.unstage,
  discard: (client: WebRuntimeOrpcClient) => client.git.discard
} satisfies Record<string, WebRuntimeProcedureSelector>

const GIT_PATHS_MUTATION_SELECTORS = {
  stage: (client: WebRuntimeOrpcClient) => client.git.bulkStage,
  unstage: (client: WebRuntimeOrpcClient) => client.git.bulkUnstage
} satisfies Record<string, WebRuntimeProcedureSelector>

const WEB_KEYBINDING_PLATFORMS: readonly KeybindingPlatform[] = ['darwin', 'linux', 'win32']
const webKeybindingListeners = new Set<(snapshot: KeybindingFileSnapshot) => void>()

const webShellSettingsApi = {
  get: async (): Promise<GlobalSettings> => getRuntimeBackedStoredSettings(),
  getSnapshot: (): GlobalSettings => getStoredSettings(),
  set: async (updates: Partial<GlobalSettings>): Promise<GlobalSettings> => {
    if (updates.activeRuntimeEnvironmentId === null) {
      disconnectActiveRuntimeEnvironment()
    }
    const sanitizedUpdates = { ...updates }
    if ('autoRenameBranchFromWorkDefaultedOn' in sanitizedUpdates) {
      sanitizedUpdates.autoRenameBranchFromWorkDefaultedOn = true
    }
    const next = mergeSettings(getStoredSettings(), sanitizedUpdates, {
      preserveAutoRenameBranchFromWorkUpdate: 'autoRenameBranchFromWork' in sanitizedUpdates
    })
    writeJson(SETTINGS_STORAGE_KEY, next)
    return syncRuntimeBackedSettings(sanitizedUpdates, next)
  },
  updatePRBotAuthorOverride: (args: { author: string; isBot: boolean }) =>
    updateRuntimePRBotAuthorOverride(args)
}

const webShellSessionApi = {
  get: (hostId?: ExecutionHostId): Promise<WorkspaceSessionState> =>
    Promise.resolve(getStoredWorkspaceSession(hostId)),
  set: async (session: WorkspaceSessionState, hostId?: ExecutionHostId): Promise<void> => {
    writeJson(sessionStorageKeyForHost(hostId), sanitizeWebRuntimeWorkspaceSession(session))
  },
  patch: async (patch: WorkspaceSessionPatch, hostId?: ExecutionHostId): Promise<void> => {
    writeJson(
      sessionStorageKeyForHost(hostId),
      sanitizeWebRuntimeWorkspaceSession({ ...getStoredWorkspaceSession(hostId), ...patch })
    )
  },
  flush: async (): Promise<void> => {}
}

const webShellOnboardingApi = {
  get: (): Promise<OnboardingState> => Promise.resolve(getStoredOnboarding()),
  update: async (
    updates: Partial<Omit<OnboardingState, 'checklist'>> & {
      checklist?: Partial<OnboardingState['checklist']>
    }
  ): Promise<OnboardingState> => {
    const current = getStoredOnboarding()
    const next: OnboardingState = {
      ...current,
      ...updates,
      flowVersion: ONBOARDING_FLOW_VERSION,
      checklist: { ...current.checklist, ...updates.checklist }
    }
    writeJson(ONBOARDING_STORAGE_KEY, next)
    return next
  }
}

const webShellCacheApi = {
  getGitHub: () =>
    Promise.resolve(
      readJson<{ pr: Record<string, { data: PRInfo | null; fetchedAt: number }> }>(
        GITHUB_CACHE_STORAGE_KEY,
        { pr: {} }
      )
    ),
  setGitHub: async (args: {
    cache: { pr: Record<string, { data: PRInfo | null; fetchedAt: number }> }
  }): Promise<void> => {
    writeJson(GITHUB_CACHE_STORAGE_KEY, args.cache)
  }
}

export function getWebShellStateApis() {
  return {
    settings: webShellSettingsApi,
    session: webShellSessionApi,
    onboarding: webShellOnboardingApi,
    cache: webShellCacheApi
  }
}

const webShellYiruProfilesApi = {
  list: () =>
    Promise.resolve({
      activeProfileId: DEFAULT_LOCAL_YIRU_PROFILE_ID,
      profiles: [createDefaultLocalYiruProfile(0)],
      multiProfileUi: false
    }),
  createLocal: () =>
    Promise.resolve({
      activeProfileId: DEFAULT_LOCAL_YIRU_PROFILE_ID,
      profiles: [createDefaultLocalYiruProfile(0)],
      profile: createDefaultLocalYiruProfile(0)
    }),
  switchProfile: () => Promise.resolve({ status: 'already-active' as const }),
  transferProject: (args: TransferYiruProfileProjectArgs) =>
    Promise.resolve({
      status: 'duplicate-target' as const,
      sourceProfileId: args.sourceProfileId,
      targetProfileId: args.targetProfileId,
      sourceRepoId: args.repoId,
      duplicateRepoId: args.repoId
    }),
  findProjectProfiles: async (): Promise<FindYiruProfileProjectsByPathResult> => ({ projects: [] })
}

let webShellKeybindingsApi: WebKeybindingsApi | null = null

export function getWebShellConfigurationApis() {
  webShellKeybindingsApi ??= createWebKeybindingsApi()
  return { keybindings: webShellKeybindingsApi, yiruProfiles: webShellYiruProfilesApi }
}

const webShellAppApi: ShellAppApi = {
  getIdentity: () =>
    Promise.resolve({
      name: 'Yiru',
      isDev: false,
      devLabel: null,
      devBranch: null,
      devWorktreeName: null,
      devRepoRoot: null,
      dockBadgeLabel: null
    }),
  relaunch: () => Promise.resolve(window.location.reload()),
  restart: () => Promise.resolve(window.location.reload()),
  reload: () => Promise.resolve(window.location.reload()),
  awaitFirstWindowStartupServices: () => Promise.resolve(),
  startupDiagnostic: () => Promise.resolve(),
  getKeyboardInputSourceId: () => Promise.resolve(null),
  setUnreadDockBadgeCount: () => Promise.resolve(),
  getFloatingTerminalCwd: () => Promise.resolve(''),
  getFloatingMarkdownDirectory: () => Promise.resolve(''),
  pickFloatingMarkdownDocument: () => Promise.resolve(null),
  pickFloatingWorkspaceDirectory: () => Promise.resolve(null)
}

const webShellStarNagApi: ShellStarNagApi = {
  onShow: () => noopUnsubscribe,
  onHide: () => noopUnsubscribe,
  dismiss: () => Promise.resolve(),
  later: () => Promise.resolve(),
  complete: () => Promise.resolve(),
  disable: () => Promise.resolve(),
  openWeb: () => Promise.resolve(),
  starYiru: () => Promise.resolve(false),
  forceShow: () => Promise.resolve(),
  agentValueMoment: () => Promise.resolve({ status: 'skipped' }),
  showAgentValueMoment: () => Promise.resolve(),
  onboardingCompleted: () => Promise.resolve()
}

export function getWebShellSystemApis(): {
  app: ShellAppApi
  repoHost: ShellRepoHostApi
  runtime: ShellRuntimeStateApi
  gh: ShellGitHubApi
  notifications: ShellNotificationsApi
  starNag: ShellStarNagApi
  updater: ShellUpdaterApi
} {
  return {
    app: webShellAppApi,
    repoHost: createRepoHostAdapter(),
    runtime: createRuntimeApi(),
    gh: createGitHubApi(),
    notifications: createNotificationsApi(),
    starNag: webShellStarNagApi,
    updater: createUpdaterApi()
  }
}

export function installWebPreloadApi(): void {
  activeEnvironment = readStoredWebRuntimeEnvironment()
  const webWindow = window as unknown as { __YIRU_WEB_CLIENT__?: boolean }
  webWindow.__YIRU_WEB_CLIENT__ = true
  window.electron = createFallbackProxy(['electron']) as Window['electron']
  window.api = withFallback(createWebPreloadApi(), []) as PreloadApi
}

function createWebPreloadApi(): Partial<PreloadApi> {
  return {
    runtimeEnvironments: createRuntimeEnvironmentsApi(),
    git: createGitApi(),
    emulator: createEmulatorApi(),
    aiVault: createAiVaultApi(),
    codexAccounts: createAccountsApi(),
    claudeAccounts: createAccountsApi(),
    pty: createPtyApi()
  }
}

function createEmptyWebKeybindingDocument(): WebKeybindingDocument {
  return {
    version: 1,
    keybindings: {},
    platforms: {
      darwin: {},
      linux: {},
      win32: {}
    }
  }
}

function getWebKeybindingPlatform(): KeybindingPlatform {
  return getKeybindingPlatform(getBrowserPlatform())
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStoredWebOverrides(
  value: unknown,
  section: string,
  diagnostics: KeybindingFileDiagnostic[]
): KeybindingOverrides {
  if (value === undefined) {
    return {}
  }
  if (!isJsonObject(value)) {
    diagnostics.push({
      severity: 'error',
      section,
      message: translate('auto.web.web.preload.api.d2e43e426a', '{{value0}} must be an object.', {
        value0: section
      })
    })
    return {}
  }

  const overrides: KeybindingOverrides = {}
  for (const [actionId, rawBindings] of Object.entries(value)) {
    if (!isKeybindingActionId(actionId)) {
      diagnostics.push({
        severity: 'warning',
        section,
        actionId,
        message: translate(
          'auto.web.web.preload.api.36761d9604',
          'Unknown keybinding action "{{value0}}" was ignored.',
          { value0: actionId }
        )
      })
      continue
    }
    if (
      !Array.isArray(rawBindings) ||
      !rawBindings.every((binding) => typeof binding === 'string')
    ) {
      diagnostics.push({
        severity: 'error',
        section,
        actionId,
        message: translate(
          'auto.web.web.preload.api.10898045f3',
          'Shortcut for "{{value0}}" was ignored: Use a string array.',
          { value0: actionId }
        )
      })
      continue
    }
    const normalized = normalizeKeybindingArrayForAction(actionId, rawBindings)
    if (!Array.isArray(normalized)) {
      const error = normalized.ok ? 'Unable to parse shortcut.' : normalized.error
      diagnostics.push({
        severity: 'error',
        section,
        actionId,
        message: translate(
          'auto.web.web.preload.api.76122208ca',
          'Shortcut for "{{value0}}" was ignored: {{value1}}',
          { value0: actionId, value1: error }
        )
      })
      continue
    }
    overrides[actionId] = normalized
  }
  return overrides
}

function normalizeWebPlatformOverrides(
  value: unknown,
  diagnostics: KeybindingFileDiagnostic[]
): Partial<Record<KeybindingPlatform, KeybindingOverrides>> {
  if (value === undefined) {
    return {}
  }
  if (!isJsonObject(value)) {
    diagnostics.push({
      severity: 'error',
      section: 'platforms',
      message: translate(
        'auto.web.web.preload.api.0a69fcd8bc',
        'platforms must be an object with darwin, linux, or win32 sections.'
      )
    })
    return {}
  }

  const result: Partial<Record<KeybindingPlatform, KeybindingOverrides>> = {}
  for (const [platform, overrides] of Object.entries(value)) {
    if (!WEB_KEYBINDING_PLATFORMS.includes(platform as KeybindingPlatform)) {
      diagnostics.push({
        severity: 'warning',
        section: `platforms.${platform}`,
        message: translate(
          'auto.web.web.preload.api.32f15bdb0f',
          'Unknown platform "{{value0}}" was ignored.',
          { value0: platform }
        )
      })
      continue
    }
    result[platform as KeybindingPlatform] = normalizeStoredWebOverrides(
      overrides,
      `platforms.${platform}`,
      diagnostics
    )
  }
  return result
}

function removeConflictingWebOverrides(
  platform: KeybindingPlatform,
  overrides: KeybindingOverrides,
  diagnostics: KeybindingFileDiagnostic[]
): KeybindingOverrides {
  let next = { ...overrides }
  for (let attempt = 0; attempt < 20; attempt++) {
    const conflicts = findKeybindingConflicts(platform, next)
    const conflictingOverrides = new Set<KeybindingActionId>()
    for (const conflict of conflicts) {
      for (const actionId of conflict.actionIds) {
        if (Object.prototype.hasOwnProperty.call(next, actionId)) {
          conflictingOverrides.add(actionId)
        }
      }
    }
    if (conflictingOverrides.size === 0) {
      return next
    }
    for (const actionId of conflictingOverrides) {
      delete next[actionId]
    }
    diagnostics.push({
      severity: 'error',
      message: translate(
        'auto.web.web.preload.api.52bee9d8a0',
        'Conflicting custom shortcuts were ignored: {{value0}}.',
        {
          value0: Array.from(conflictingOverrides)
            .map((actionId) => actionId)
            .join(', ')
        }
      )
    })
  }
  return next
}

function readWebKeybindingDocument(): WebKeybindingDocument {
  const document = readJson(KEYBINDINGS_STORAGE_KEY, createEmptyWebKeybindingDocument())
  return {
    version: 1,
    keybindings: isJsonObject(document.keybindings)
      ? (document.keybindings as KeybindingOverrides)
      : {},
    platforms: isJsonObject(document.platforms)
      ? (document.platforms as Partial<Record<KeybindingPlatform, KeybindingOverrides>>)
      : {}
  }
}

function getWebKeybindingSnapshot(): KeybindingFileSnapshot {
  const platform = getWebKeybindingPlatform()
  const diagnostics: KeybindingFileDiagnostic[] = []
  const document = readWebKeybindingDocument()
  const commonOverrides = normalizeStoredWebOverrides(
    document.keybindings,
    'keybindings',
    diagnostics
  )
  const platformOverrides = normalizeWebPlatformOverrides(document.platforms, diagnostics)
  const overrides = removeConflictingWebOverrides(
    platform,
    {
      ...commonOverrides,
      ...platformOverrides[platform]
    },
    diagnostics
  )

  return {
    path: 'Browser local storage',
    platform,
    exists: window.localStorage.getItem(KEYBINDINGS_STORAGE_KEY) !== null,
    overrides,
    commonOverrides,
    platformOverrides,
    diagnostics
  }
}

function writeWebKeybindingAction(
  actionId: KeybindingActionId,
  bindings: string[] | null
): KeybindingFileSnapshot {
  if (!isKeybindingActionId(actionId)) {
    throw new Error(`Unknown keybinding action "${actionId}".`)
  }
  const normalizedBindings =
    bindings === null ? null : normalizeKeybindingArrayForAction(actionId, bindings)
  if (normalizedBindings !== null && !Array.isArray(normalizedBindings)) {
    throw new Error(normalizedBindings.ok ? 'Unable to parse shortcut.' : normalizedBindings.error)
  }

  const platform = getWebKeybindingPlatform()
  const currentSnapshot = getWebKeybindingSnapshot()
  const candidateOverrides = { ...currentSnapshot.overrides }
  if (normalizedBindings === null) {
    delete candidateOverrides[actionId]
  } else {
    candidateOverrides[actionId] = normalizedBindings
  }
  const blockingConflict = findKeybindingConflicts(platform, candidateOverrides).find((conflict) =>
    conflict.actionIds.includes(actionId)
  )
  if (blockingConflict) {
    throw new Error(
      `${formatKeybindingList([blockingConflict.binding], platform)} conflicts with another shortcut.`
    )
  }

  const activePlatform: KeybindingOverrides = { ...currentSnapshot.platformOverrides[platform] }
  if (normalizedBindings === null) {
    delete activePlatform[actionId]
  } else {
    activePlatform[actionId] = normalizedBindings
  }

  writeJson(KEYBINDINGS_STORAGE_KEY, {
    version: 1,
    keybindings: currentSnapshot.commonOverrides,
    platforms: {
      ...currentSnapshot.platformOverrides,
      darwin: currentSnapshot.platformOverrides.darwin ?? {},
      linux: currentSnapshot.platformOverrides.linux ?? {},
      win32: currentSnapshot.platformOverrides.win32 ?? {},
      [platform]: activePlatform
    }
  } satisfies WebKeybindingDocument)

  const snapshot = getWebKeybindingSnapshot()
  notifyWebKeybindingListeners(snapshot)
  return snapshot
}

function notifyWebKeybindingListeners(snapshot: KeybindingFileSnapshot): void {
  for (const listener of webKeybindingListeners) {
    listener(snapshot)
  }
}

function createWebKeybindingsApi(): WebKeybindingsApi {
  return {
    get: () => Promise.resolve(getWebKeybindingSnapshot()),
    ensureFile: () => Promise.resolve(getWebKeybindingSnapshot()),
    setAction: async ({ actionId, bindings }) => writeWebKeybindingAction(actionId, bindings),
    reload: () => {
      const snapshot = getWebKeybindingSnapshot()
      notifyWebKeybindingListeners(snapshot)
      return Promise.resolve(snapshot)
    },
    openFile: () => Promise.resolve(getWebKeybindingSnapshot()),
    revealFile: () => Promise.resolve(getWebKeybindingSnapshot()),
    onChanged: (callback) => {
      webKeybindingListeners.add(callback)
      const onStorage = (event: StorageEvent): void => {
        if (event.key === KEYBINDINGS_STORAGE_KEY) {
          callback(getWebKeybindingSnapshot())
        }
      }
      window.addEventListener('storage', onStorage)
      return () => {
        webKeybindingListeners.delete(callback)
        window.removeEventListener('storage', onStorage)
      }
    }
  }
}

// Why: the web client keeps readSession on its compatibility adapter because
// it has no local MessagePort. Live tailing uses the typed runtime client from
// the native-chat feature directly.
function createRuntimeApi(): ShellRuntimeStateApi {
  return {
    syncWindowGraph: async (_graph: RuntimeSyncWindowGraph) => getRemoteRuntimeStatus(),
    getTerminalFitOverrides: () => Promise.resolve([]),
    getTerminalDrivers: () => Promise.resolve([]),
    getBrowserDrivers: () => Promise.resolve([]),
    restoreTerminalFit: () => Promise.resolve({ restored: false }),
    reclaimBrowserForDesktop: () => Promise.resolve({ reclaimed: false })
  }
}

function createRuntimeEnvironmentsApi(): NonNullable<Partial<PreloadApi>['runtimeEnvironments']> {
  return {
    list: async () => {
      const environment = requireActiveEnvironmentOrNull()
      return environment ? [redactStoredWebRuntimeEnvironment(environment)] : []
    },
    resolve: async ({ selector }) =>
      redactStoredWebRuntimeEnvironment(resolveEnvironment(selector)),
    remove: async ({ selector }) => {
      const environment = resolveEnvironment(selector)
      if (activeEnvironment?.id === environment.id) {
        disconnectActiveRuntimeEnvironment()
      }
      return { removed: redactStoredWebRuntimeEnvironment(environment) }
    },
    disconnect: async ({ selector }) => {
      const environment = resolveEnvironment(selector)
      if (activeEnvironment?.id === environment.id) {
        disconnectActiveRuntimeEnvironment()
      }
      return { disconnected: redactStoredWebRuntimeEnvironment(environment) }
    },
    getStatus: ({ selector, timeoutMs }) => getEnvironmentStatusEnvelope(selector, timeoutMs),
    call: ({ selector, method, params, timeoutMs }) => {
      const environment = resolveEnvironment(selector)
      if (method === STATUS_GET_CONTRACT.name) {
        return getEnvironmentStatusEnvelope(environment.id, timeoutMs)
      }
      return callLegacyEnvironmentEnvelope(environment, method, params, timeoutMs)
    },
    subscribe: async ({ selector, method, params, timeoutMs }, callbacks) => {
      const environment = resolveEnvironment(selector)
      const client = getClientForEnvironment(environment)
      return client.subscribe(method, params, callbacks, { timeoutMs })
    },
    callOrpcProcedure: async ({ selector, path, input, timeoutMs }, options) => {
      const environment = resolveEnvironment(selector)
      const client = await getClientForEnvironment(environment).getOrpcClient(
        timeoutMs,
        options?.signal
      )
      return resolveOrpcClientProcedure(client, path)(input, {
        signal: options?.signal,
        context: { onBinary: options?.onBinary }
      })
    }
  }
}

// Why: `WebRuntimeOrpcClient` is a `ContractRouterClient` proxy — each property
// access returns a nested proxy down to the callable leaf, mirroring how
// `orpc-legacy-client.ts` walks `runtimeContract` by the same path array. This
// lets one preload member dispatch any contract procedure without a
// per-domain switch.
function resolveOrpcClientProcedure(
  client: WebRuntimeOrpcClient,
  path: readonly string[]
): (
  input: unknown,
  options?: { signal?: AbortSignal; context?: WebRuntimeOrpcClientContext }
) => Promise<unknown> {
  let node: unknown = client
  for (const segment of path) {
    node = (node as Record<string, unknown>)[segment]
  }
  return node as (
    input: unknown,
    options?: { signal?: AbortSignal; context?: WebRuntimeOrpcClientContext }
  ) => Promise<unknown>
}

function createAiVaultApi(): NonNullable<Partial<PreloadApi>['aiVault']> {
  return {
    listSessions: (args?: AiVaultListArgs) => {
      const environment = requireActiveEnvironment()
      const executionHostId = toRuntimeExecutionHostId(environment.id)
      const requestedScope = normalizeExecutionHostScope(
        args?.executionHostScope ?? executionHostId
      )
      if (requestedScope !== 'all' && requestedScope !== executionHostId) {
        return Promise.resolve(webAiVaultUnavailableResult(requestedScope))
      }
      // Why: the browser client has no local filesystem; every history scan
      // runs on the paired server and must be stamped as that runtime host.
      return callRuntimeProcedure((client, options) =>
        client.aiVault.listSessions(
          {
            limit: args?.limit,
            force: args?.force,
            scopePaths: args?.scopePaths ? [...args.scopePaths] : undefined,
            executionHostId
          },
          options
        )
      )
    },
    // Why: the runtime RPC surface only exposes aiVault.listSessions; subagent
    // transcript listing has no server-side method yet, so the browser client
    // reports an empty (not erroring) result.
    listSubagentSessions: () => Promise.resolve({ sessions: [], issues: [] }),
    onWindowFocused: () => noopUnsubscribe
  }
}

function webAiVaultUnavailableResult(executionHostId: ExecutionHostId): AiVaultListResult {
  return {
    sessions: [],
    issues: [
      {
        executionHostId,
        agent: 'codex',
        path: executionHostId,
        message: translate(
          'auto.web.webPreloadApi.aiVaultUnavailableForHost',
          'Agent Session History is not available for this execution host.'
        )
      }
    ],
    scannedAt: new Date().toISOString()
  }
}

function createRepoHostAdapter(): ShellRepoHostApi {
  return {
    // Why: browser clients have no native filesystem picker. These outcomes
    // preserve cancellation semantics without pretending the runtime picked a path.
    pickFolder: () => Promise.resolve(null),
    pickFolders: () => Promise.resolve([]),
    pickDirectory: () => Promise.resolve(null),
    removeForHost: () => {
      throw new Error(
        translate('auto.web.web.preload.api.31bfe8ae1a', 'Unavailable in the web client.')
      )
    },
    reorderForHost: async () => {
      throw new Error(
        translate('auto.web.web.preload.api.31bfe8ae1a', 'Unavailable in the web client.')
      )
    },
    // Why: repo.clone has no cancellation procedure, so a browser adapter
    // cannot cancel a clone already executing on its paired runtime.
    cloneAbort: () => Promise.resolve(),
    getDefaultCreateProjectParent: async () => {
      const result = await callRuntimeProcedure((client, options) =>
        client.files.browseServerDir({ path: '~' }, options)
      )
      return getDefaultCreateProjectParent(result.resolvedPath)
    }
  }
}

// Why: track the in-flight abortable status request per token so cancelStatus
// can abort the matching subscription and close its remote request context.
const webGitStatusAbortControllers = new Map<string, AbortController>()

async function callAbortableRuntimeStatus(
  requestToken: string,
  params: Parameters<WebRuntimeOrpcClient['git']['status']>[0]
): Promise<Awaited<ReturnType<WebRuntimeOrpcClient['git']['status']>>> {
  webGitStatusAbortControllers.get(requestToken)?.abort()
  const controller = new AbortController()
  webGitStatusAbortControllers.set(requestToken, controller)
  try {
    return await callRuntimeProcedure((client, options) => client.git.status(params, options), {
      priority: 'background',
      signal: controller.signal
    })
  } finally {
    if (webGitStatusAbortControllers.get(requestToken) === controller) {
      webGitStatusAbortControllers.delete(requestToken)
    }
  }
}

function createGitApi(): NonNullable<Partial<PreloadApi>['git']> {
  return {
    status: async ({
      worktreePath,
      includeIgnored,
      bypassEffectiveUpstreamNegativeCache,
      reuseLineStats,
      requestToken
    }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      const params = {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        includeIgnored,
        bypassEffectiveUpstreamNegativeCache,
        reuseLineStats
      }
      // Why: without a token there's nothing to cancel, so stay on the pooled
      // call transport. With one, retain its AbortController so cancelStatus
      // can cancel the typed request and its remote execution context.
      if (!requestToken) {
        return callRuntimeProcedure((client, options) => client.git.status(params, options), {
          priority: 'background'
        })
      }
      return callAbortableRuntimeStatus(requestToken, params)
    },
    cancelStatus: async ({ requestToken }) => {
      webGitStatusAbortControllers.get(requestToken)?.abort()
    },
    submoduleStatus: async ({ worktreePath, submodulePath, area }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.submoduleStatus(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            submodulePath,
            area
          },
          options
        )
      )
    },
    checkIgnored: async ({ worktreePath, paths }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.checkIgnored(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            paths
          },
          options
        )
      )
    },
    // Why: the "add huge folder to .gitignore" flow is a local-desktop helper;
    // in the web runtime there's no offer, so return no candidates / no-op.
    findHugeFoldersToIgnore: async () => [],
    appendGitignore: async () => false,
    history: async ({ worktreePath, limit, baseRef }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure(
        (client, options) =>
          client.git.history(
            {
              worktree: toRuntimeWorktreeSelector(worktree.id),
              limit,
              baseRef
            },
            options
          ),
        { priority: 'background' }
      )
    },
    conflictOperation: async ({ worktreePath }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure(
        (client, options) =>
          client.git.conflictOperation(
            {
              worktree: toRuntimeWorktreeSelector(worktree.id)
            },
            options
          ),
        { priority: 'background' }
      )
    },
    abortMerge: async ({ worktreePath }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeProcedure((client, options) =>
        client.git.abortMerge(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id)
          },
          options
        )
      )
    },
    abortRebase: async ({ worktreePath }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeProcedure((client, options) =>
        client.git.abortRebase(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id)
          },
          options
        )
      )
    },
    abortRevert: async ({ worktreePath }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeProcedure((client, options) =>
        client.git.abortRevert(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id)
          },
          options
        )
      )
    },
    addTag: async ({ worktreePath, name, commit, message, force }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.addTag(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            name,
            commit,
            message,
            force
          },
          options
        )
      )
    },
    createBranch: async ({ worktreePath, name, commit, checkout }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.createBranch(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            name,
            commit,
            checkout
          },
          options
        )
      )
    },
    checkoutCommit: async ({ worktreePath, commit }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.checkoutCommit(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            commit
          },
          options
        )
      )
    },
    cherryPick: async ({ worktreePath, commit, mainline }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.cherryPick(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            commit,
            mainline
          },
          options
        )
      )
    },
    revertCommit: async ({ worktreePath, commit, mainline }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.revertCommit(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            commit,
            mainline
          },
          options
        )
      )
    },
    dropCommit: async ({ worktreePath, commit }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.dropCommit(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            commit
          },
          options
        )
      )
    },
    mergeCommit: async ({ worktreePath, commit, noFf, squash, message }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.mergeCommit(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            commit,
            noFf,
            squash,
            message
          },
          options
        )
      )
    },
    rebaseOntoCommit: async ({ worktreePath, commit }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.rebaseOntoCommit(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            commit
          },
          options
        )
      )
    },
    resetToCommit: async ({ worktreePath, commit, mode }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.resetToCommit(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            commit,
            mode
          },
          options
        )
      )
    },
    diff: async ({ worktreePath, filePath, staged, compareAgainstHead }) => {
      const file = await resolveRuntimeFilePath(filePath, worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.diff(
          {
            worktree: toRuntimeWorktreeSelector(file.worktree.id),
            filePath: file.relativePath,
            staged,
            compareAgainstHead
          },
          options
        )
      )
    },
    branchCompare: async ({ worktreePath, baseRef }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure(
        (client, options) =>
          client.git.branchCompare(
            {
              worktree: toRuntimeWorktreeSelector(worktree.id),
              baseRef
            },
            options
          ),
        { priority: 'background' }
      )
    },
    commitCompare: async ({ worktreePath, commitId }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.commitCompare(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            commitId
          },
          options
        )
      )
    },
    upstreamStatus: async ({ worktreePath, pushTarget }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure(
        (client, options) =>
          client.git.upstreamStatus(
            {
              worktree: toRuntimeWorktreeSelector(worktree.id),
              pushTarget
            },
            options
          ),
        { priority: 'background' }
      )
    },
    fetch: async ({ worktreePath, pushTarget }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeProcedure((client, options) =>
        client.git.fetch(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            pushTarget
          },
          options
        )
      )
    },
    syncFork: async ({ worktreePath, expectedUpstream }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure(
        (client, options) =>
          client.git.forkSync(
            {
              worktree: toRuntimeWorktreeSelector(worktree.id),
              expectedUpstream
            },
            options
          ),
        { timeoutMs: 60_000 }
      )
    },
    push: async ({ worktreePath, publish, pushTarget }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeProcedure((client, options) =>
        client.git.push(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            publish,
            pushTarget
          },
          options
        )
      )
    },
    pull: async ({ worktreePath, pushTarget }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeProcedure((client, options) =>
        client.git.pull(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            pushTarget
          },
          options
        )
      )
    },
    fastForward: async ({ worktreePath, pushTarget }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeProcedure((client, options) =>
        client.git.fastForward(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            pushTarget
          },
          options
        )
      )
    },
    rebaseFromBase: async ({ worktreePath, baseRef }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeProcedure((client, options) =>
        client.git.rebaseFromBase(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            baseRef
          },
          options
        )
      )
    },
    branchDiff: async ({ worktreePath, filePath, compare, oldPath }) => {
      const file = await resolveRuntimeFilePath(filePath, worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.branchDiff(
          {
            worktree: toRuntimeWorktreeSelector(file.worktree.id),
            filePath: file.relativePath,
            compare,
            oldPath
          },
          options
        )
      )
    },
    commitDiff: async ({ worktreePath, filePath, commitOid, parentOid, oldPath }) => {
      const file = await resolveRuntimeFilePath(filePath, worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.commitDiff(
          {
            worktree: toRuntimeWorktreeSelector(file.worktree.id),
            filePath: file.relativePath,
            commitOid,
            parentOid,
            oldPath
          },
          options
        )
      )
    },
    commit: async ({ worktreePath, message }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.commit(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            message
          },
          options
        )
      )
    },
    generateCommitMessage: async () => ({
      success: false,
      error: translate(
        'auto.web.web.preload.api.9fc90740b6',
        'Commit message generation is unavailable in the web client.'
      )
    }),
    discoverCommitMessageModels: async () => ({
      success: false,
      error: translate(
        'auto.web.web.preload.api.e57c82d276',
        'Commit message model discovery is unavailable in the web client.'
      )
    }),
    cancelGenerateCommitMessage: () => Promise.resolve(),
    generatePullRequestFields: async () => ({
      success: false,
      error: translate(
        'auto.web.web.preload.api.b8a1618172',
        'Pull request detail generation is unavailable in the web client.'
      )
    }),
    cancelGeneratePullRequestFields: () => Promise.resolve(),
    stage: async ({ worktreePath, filePath }) => mutateGitPath('stage', worktreePath, filePath),
    bulkStage: async ({ worktreePath, filePaths }) =>
      mutateGitPaths('stage', worktreePath, filePaths),
    unstage: async ({ worktreePath, filePath }) => mutateGitPath('unstage', worktreePath, filePath),
    bulkUnstage: async ({ worktreePath, filePaths }) =>
      mutateGitPaths('unstage', worktreePath, filePaths),
    discard: async ({ worktreePath, filePath }) => mutateGitPath('discard', worktreePath, filePath),
    bulkDiscard: async ({ worktreePath, filePaths }) => {
      for (const filePath of filePaths) {
        await mutateGitPath('discard', worktreePath, filePath)
      }
    },
    remoteFileUrl: async ({ worktreePath, relativePath, line }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.remoteFileUrl(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            relativePath,
            line
          },
          options
        )
      )
    },
    remoteCommitUrl: async ({ worktreePath, sha }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      return callRuntimeProcedure((client, options) =>
        client.git.remoteCommitUrl(
          {
            worktree: toRuntimeWorktreeSelector(worktree.id),
            sha
          },
          options
        )
      )
    }
  }
}

function createEmulatorApi(): NonNullable<Partial<PreloadApi>['emulator']> {
  return {
    startFrameStream: () => Promise.reject(new Error('Mobile emulator is unavailable on web.')),
    stopFrameStream: () => Promise.resolve(),
    onFrameStreamFrame: () => noopUnsubscribe,
    onFrameStreamError: () => noopUnsubscribe
  } as unknown as NonNullable<Partial<PreloadApi>['emulator']>
}

function createGitHubApi(): WebGitHubApi {
  const githubApi = {
    viewer: () => Promise.resolve(null),
    enqueuePRRefresh: () => Promise.resolve(false),
    reportVisiblePRRefreshCandidates: () => Promise.resolve(false),
    checkYiruStarred: () => Promise.resolve(null),
    starYiru: () => Promise.resolve(false)
  } satisfies WebGitHubApi

  return githubApi
}

function createNotificationsApi(): ShellNotificationsApi {
  return {
    // Why: browsers cannot reach Electron's native notification centre. The
    // reverse shell adapter keeps this degradation structured until a browser
    // Notifications API implementation owns permission and delivery semantics.
    displayNative: () => Promise.resolve({ delivered: false, reason: 'not-supported' }),
    dismissNative: () => Promise.resolve({ dismissed: 0 }),
    openSystemSettings: () => Promise.resolve(),
    getPermissionStatus: () =>
      Promise.resolve({ supported: false, platform: getBrowserPlatform(), requested: false }),
    probeDelivery: () => Promise.resolve({ state: 'unsupported' as const, authoritative: false }),
    playSound: () => Promise.resolve({ played: false, reason: 'missing-path' })
  }
}

// Why: select/remove aren't stubbed here — they moved to the runtime contract
// (`accounts.selectClaude`/`selectCodex`, `removeClaude`/`removeCodex`) and web
// calls them through provider-accounts-client.ts, never through window.api.
function createAccountsApi(): never {
  const empty = {
    accounts: [],
    activeAccountId: null,
    activeAccountIdsByRuntime: { host: null, wsl: {} }
  }
  return {
    list: () => Promise.resolve(empty),
    add: () => Promise.resolve(empty),
    cancelPendingLogin: () => Promise.resolve(false),
    reauthenticate: () => Promise.resolve(empty)
  } as never
}

function createUpdaterApi(): ShellUpdaterApi {
  return {
    getVersion: () => Promise.resolve('web'),
    getStatus: () => Promise.resolve({ state: 'idle' } as never),
    check: () => Promise.resolve(),
    download: () => Promise.resolve(),
    quitAndInstall: () => Promise.resolve(),
    dismissNudge: () => Promise.resolve(),
    onStatus: () => noopUnsubscribe,
    onClearDismissal: () => noopUnsubscribe
  }
}

function createPtyApi(): NonNullable<Partial<PreloadApi>['pty']> {
  return {
    spawn: () => Promise.reject(new Error('Local PTYs are unavailable in the web client.')),
    write: () => {},
    writeAccepted: () => Promise.resolve(false),
    resize: () => {},
    claimViewport: () => {},
    reportGeometry: () => {},
    signal: () => {},
    // Web panes clear the host buffer via the terminal.clearBuffer runtime RPC.
    clearBuffer: () => {},
    kill: () => Promise.resolve(),
    ackColdRestore: () => {},
    ackData: () => {},
    onDeliveryResyncRequest: () => noopUnsubscribe,
    respondDeliveryResync: () => {},
    // Why healthy stub: web terminals ride the remote-runtime transport, not
    // main's delivery gate — a zero-in-flight reply keeps the watchdog idle.
    reportRendererDeliveryState: () =>
      Promise.resolve({ inFlightTotalChars: 0, inFlightPtyCount: 0, msSinceLastAck: null }),
    getPtyDataListenerCount: () => 0,
    rendererDispatcherReady: () => {},
    setActiveRendererPty: () => {},
    setRendererPtyVisible: () => {},
    setHiddenRendererPty: () => {},
    setPtyDeliveryInterest: () => {},
    // Why no-op: remote-runtime PTYs are never hidden-gate markable, so the
    // web client has no main-side responder to feed.
    publishTerminalViewAttributes: () => {},
    hasChildProcesses: () => Promise.resolve(false),
    getForegroundProcess: () => Promise.resolve(null),
    // Why: paired web panes cannot provide a local post-boundary process scan.
    confirmForegroundProcess: () => Promise.resolve(null),
    getCwd: () => Promise.resolve('~'),
    getSize: () => Promise.resolve(null),
    listSessions: () => Promise.resolve([]),
    getAuthoritativeBufferSnapshotCapabilities: (ids) =>
      ids.map((id) => ({ id, authoritative: false })),
    hasPty: () => Promise.resolve(null),
    getMainBufferSnapshot: () => Promise.resolve(null),
    // Why: remote-runtime PTYs never transit local main, so the web client has
    // no side-effect facts source; renderer byte parsing stays authoritative.
    onSideEffect: () => noopUnsubscribe,
    getSideEffectSnapshot: () => Promise.resolve(null),
    getRendererDeliveryDebugSnapshot: () =>
      Promise.resolve({
        pendingPtyCount: 0,
        pendingChars: 0,
        maxPendingCharsByPty: 0,
        rendererInFlightPtyCount: 0,
        rendererInFlightChars: 0,
        maxRendererInFlightCharsByPty: 0,
        activeRendererPtyCount: 0,
        flushScheduled: false,
        peakPendingChars: 0,
        peakMaxPendingCharsByPty: 0,
        peakRendererInFlightChars: 0,
        peakMaxRendererInFlightCharsByPty: 0,
        ackGatedFlushSkipCount: 0,
        hiddenDeliveryGatedPtyCount: 0,
        hiddenDeliveryGatedVisiblePtyCount: 0,
        hiddenDeliveryGatedActivePtyCount: 0,
        deliveryInterestPtyCount: 0,
        hiddenDeliveryDroppedChars: 0,
        hiddenDeliveryDroppedChunks: 0,
        pendingDroppedChars: 0,
        diagnostics: EMPTY_PTY_MAIN_DELIVERY_DIAGNOSTICS,
        rendererLifecycleResetCount: 0,
        lastLifecycleResetClearedChars: 0,
        rendererPtyDispatcherReady: false,
        rendererDispatcherReadyForcedCount: 0
      }),
    onData: () => noopUnsubscribe,
    onReplay: () => noopUnsubscribe,
    onModelRestoreNeeded: () => noopUnsubscribe,
    onExit: () => noopUnsubscribe,
    onClearBufferRequest: () => noopUnsubscribe,
    declarePendingPaneSerializer: () => Promise.resolve(0),
    settlePaneSerializer: () => Promise.resolve(),
    clearPendingPaneSerializer: () => Promise.resolve(),
    reportRendererSerializerReady: () => Promise.resolve()
  }
}

async function callLegacyEnvironmentEnvelope<TResult = unknown>(
  environment: StoredWebRuntimeEnvironment,
  method: string,
  params?: unknown,
  timeoutMs?: number
): Promise<RuntimeRpcResponse<TResult>> {
  const priority = isLegacyBackgroundRuntimeMethod(method) ? 'background' : 'foreground'
  const response = await runtimeCallQueuePool.enqueue(environment.id, priority, () =>
    getClientForEnvironment(environment).call(method, params, { timeoutMs })
  )
  updateEnvironmentFromResponse(environment, response)
  return response as RuntimeRpcResponse<TResult>
}

async function callRuntimeProcedure<TResult>(
  procedure: WebRuntimeProcedure<TResult>,
  options: WebRuntimeProcedureOptions = {}
): Promise<TResult> {
  const environment = options.environment ?? requireActiveEnvironment()
  const timeoutMs = options.timeoutMs ?? 30_000
  return runtimeCallQueuePool.enqueue(
    environment.id,
    options.priority ?? 'foreground',
    async () => {
      const timeoutSignal = AbortSignal.timeout(timeoutMs)
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal
      const client = await getClientForEnvironment(environment).getOrpcClient(timeoutMs, signal)
      return procedure(client, { signal })
    }
  )
}

function callSelectedRuntimeProcedure<TInput, TResult>(
  selector: (client: WebRuntimeOrpcClient) => SelectedWebRuntimeProcedure<TInput, TResult>,
  input: TInput,
  options?: WebRuntimeProcedureOptions
): Promise<TResult> {
  return callRuntimeProcedure(
    (client, callOptions) => selector(client)(input, callOptions),
    options
  )
}

async function getEnvironmentStatusEnvelope(
  selector: string,
  timeoutMs = 15_000
): Promise<RuntimeRpcResponse<RuntimeStatus>> {
  const environment = resolveEnvironment(selector)
  const id = `web-orpc-${crypto.randomUUID()}`
  try {
    const result = await callRuntimeProcedure(
      (client, options) => client.status.get(undefined, options),
      { environment, timeoutMs }
    )
    activeEnvironment = updateStoredEnvironmentRuntimeId(environment, result.runtimeId)
    return { id, ok: true, result, _meta: { runtimeId: result.runtimeId } }
  } catch (error) {
    return {
      id,
      ok: false,
      error: {
        code: error instanceof ORPCError ? error.code : 'internal_error',
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof ORPCError && error.data !== undefined ? { data: error.data } : {})
      },
      _meta: { runtimeId: environment.runtimeId }
    }
  }
}

async function getRemoteRuntimeStatus(): Promise<RuntimeStatus> {
  return callRuntimeProcedure((client, options) => client.status.get(undefined, options), {
    timeoutMs: 15_000
  })
}

function getClientForEnvironment(environment: StoredWebRuntimeEnvironment): WebRuntimeClient {
  if (!activeClient || activeClientEnvironmentId !== environment.id) {
    activeClient?.close()
    activeClient = new WebRuntimeClient(getPreferredWebPairingOffer(environment), (runtimeId) => {
      activeEnvironment = updateStoredEnvironmentRuntimeId(environment, runtimeId)
    })
    activeClientEnvironmentId = environment.id
    // Why: the host-event stream is bound to one runtime connection. Swapping
    // environments must reopen it against the new host, or listeners keep
    // waiting on a stream that belongs to the previous pairing.
    runtimeClientEvents.reset()
  }
  return activeClient
}

function closeActiveRuntimeClients(): void {
  activeClient?.close()
  activeClient = null
  activeClientEnvironmentId = null
  runtimeClientEvents.reset()
  invalidateRuntimeWorktreeCaches()
}

function disconnectActiveRuntimeEnvironment(): void {
  closeActiveRuntimeClients()
  clearStoredWebRuntimeEnvironment()
  activeEnvironment = null
}

function resolveEnvironment(selector: string): StoredWebRuntimeEnvironment {
  const environment = requireActiveEnvironment()
  if (selector === environment.id || selector === environment.name || selector === 'active') {
    return environment
  }
  if (selector.startsWith('web-') && environment.id.startsWith('web-')) {
    // Why: persisted terminal ids can outlive a web-client re-pair, which creates
    // a fresh web-* environment id even when it points at the same active server.
    return environment
  }
  throw new Error(`Unknown Yiru runtime environment: ${selector}`)
}

function requireActiveEnvironment(): StoredWebRuntimeEnvironment {
  activeEnvironment = activeEnvironment ?? readStoredWebRuntimeEnvironment()
  if (!activeEnvironment) {
    throw new Error('Connect this web client to a runtime host first.')
  }
  return activeEnvironment
}

function requireActiveEnvironmentOrNull(): StoredWebRuntimeEnvironment | null {
  activeEnvironment = activeEnvironment ?? readStoredWebRuntimeEnvironment()
  return activeEnvironment
}

function updateEnvironmentFromResponse(
  environment: StoredWebRuntimeEnvironment,
  response: RuntimeRpcResponse<unknown>
): void {
  const runtimeId = response.ok ? response._meta.runtimeId : (response._meta?.runtimeId ?? null)
  activeEnvironment = updateStoredEnvironmentRuntimeId(environment, runtimeId)
}

function getStoredSettings(): GlobalSettings {
  const environment = (activeEnvironment = activeEnvironment ?? readStoredWebRuntimeEnvironment())
  const defaults = getDefaultSettings('~')
  const rawStoredSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
  const rawStored = readJson<Partial<GlobalSettings>>(
    SETTINGS_STORAGE_KEY,
    {}
  ) as Partial<GlobalSettings> & {
    experimentalNewWorktreeCardStyle?: unknown
    compactWorktreeCards?: unknown
    experimentalCompactWorktreeCards?: unknown
  }
  const {
    experimentalNewWorktreeCardStyle: _retiredCardStyle,
    compactWorktreeCards: _retiredCompactCards,
    experimentalCompactWorktreeCards: _retiredExperimentalCompactCards,
    ...stored
  } = rawStored
  void _retiredCardStyle
  void _retiredCompactCards
  void _retiredExperimentalCompactCards
  const hadRetiredCardSettings = [
    'experimentalNewWorktreeCardStyle',
    'compactWorktreeCards',
    'experimentalCompactWorktreeCards'
  ].some((key) => Object.prototype.hasOwnProperty.call(rawStored, key))
  const migratedStored = {
    ...stored,
    ...normalizeAutoRenameBranchFromWorkDefaultOn(stored),
    ...normalizeTerminalCursorStyleDefault(stored),
    terminalCustomThemes: normalizeTerminalCustomThemes(stored.terminalCustomThemes),
    uiLanguage: normalizeUiLanguage(stored.uiLanguage)
  }
  if (
    rawStoredSettings &&
    (hadRetiredCardSettings ||
      stored.autoRenameBranchFromWork !== migratedStored.autoRenameBranchFromWork ||
      stored.autoRenameBranchFromWorkDefaultedOn !==
        migratedStored.autoRenameBranchFromWorkDefaultedOn ||
      stored.terminalCursorStyle !== migratedStored.terminalCursorStyle ||
      stored.terminalCursorStyleDefaultedToBlock !==
        migratedStored.terminalCursorStyleDefaultedToBlock ||
      stored.terminalCustomThemes !== migratedStored.terminalCustomThemes ||
      stored.uiLanguage !== migratedStored.uiLanguage)
  ) {
    try {
      const parsed = JSON.parse(rawStoredSettings) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        writeJson(SETTINGS_STORAGE_KEY, migratedStored)
      }
    } catch {
      // Keep readJson's invalid-JSON fallback non-destructive.
    }
  }
  return mergeSettings(
    {
      ...defaults,
      floatingTerminalEnabled: false,
      rightSidebarOpenByDefault: false,
      activeRuntimeEnvironmentId: environment?.id ?? null
    },
    migratedStored
  )
}

async function getRuntimeBackedStoredSettings(): Promise<GlobalSettings> {
  const local = getStoredSettings()
  if (!requireActiveEnvironmentOrNull()) {
    return local
  }
  try {
    const result = await callRuntimeProcedure(
      (client, options) => client.settings.get(undefined, options),
      { timeoutMs: 15_000 }
    )
    const runtimeSettings: Partial<GlobalSettings> = {}
    if (typeof result.settings.minimaxGroupId === 'string') {
      runtimeSettings.minimaxGroupId = result.settings.minimaxGroupId
    }
    if (typeof result.settings.minimaxUsageModels === 'string') {
      runtimeSettings.minimaxUsageModels = result.settings.minimaxUsageModels
    }
    if (Array.isArray(result.settings.prBotAuthorOverrides)) {
      runtimeSettings.prBotAuthorOverrides = normalizePRBotAuthorOverrides(
        result.settings.prBotAuthorOverrides
      )
    }
    const next = mergeSettings(local, runtimeSettings)
    writeJson(SETTINGS_STORAGE_KEY, next)
    return next
  } catch {
    // Why: unpaired/offline web clients keep a local settings fallback.
    return local
  }
}

async function syncRuntimeBackedSettings(
  updates: Partial<GlobalSettings>,
  localNext: GlobalSettings
): Promise<GlobalSettings> {
  if (!requireActiveEnvironmentOrNull()) {
    return localNext
  }
  const runtimeUpdates: Partial<GlobalSettings> = {}
  if (typeof updates.minimaxGroupId === 'string') {
    runtimeUpdates.minimaxGroupId = updates.minimaxGroupId
  }
  if (typeof updates.minimaxUsageModels === 'string') {
    runtimeUpdates.minimaxUsageModels = updates.minimaxUsageModels
  }
  if (Array.isArray(updates.prBotAuthorOverrides)) {
    runtimeUpdates.prBotAuthorOverrides = normalizePRBotAuthorOverrides(
      updates.prBotAuthorOverrides
    )
  }
  if (Object.keys(runtimeUpdates).length === 0) {
    return localNext
  }
  try {
    const result = await callRuntimeProcedure(
      (client, options) => client.settings.update(runtimeUpdates, options),
      { timeoutMs: 15_000 }
    )
    const next = mergeSettings(localNext, result.settings)
    writeJson(SETTINGS_STORAGE_KEY, next)
    return next
  } catch {
    // Why: unpaired/offline web clients still need local settings persistence.
    return localNext
  }
}

async function updateRuntimePRBotAuthorOverride(args: {
  author: string
  isBot: boolean
}): Promise<GlobalSettings> {
  const local = getStoredSettings()
  if (requireActiveEnvironmentOrNull()) {
    // Why: a paired client must not report a successful mark that the
    // authoritative runtime failed to persist and will later overwrite.
    const result = await callRuntimeProcedure(
      (client, options) => client.settings.updatePRBotAuthorOverride(args, options),
      { timeoutMs: 15_000 }
    )
    const next = mergeSettings(local, {
      prBotAuthorOverrides: normalizePRBotAuthorOverrides(result.settings.prBotAuthorOverrides)
    })
    writeJson(SETTINGS_STORAGE_KEY, next)
    return next
  }
  const next = mergeSettings(local, {
    prBotAuthorOverrides: applyPRBotAuthorOverride(
      local.prBotAuthorOverrides,
      args.author,
      args.isBot
    )
  })
  writeJson(SETTINGS_STORAGE_KEY, next)
  return next
}

function getStoredOnboarding(): OnboardingState {
  const storedRaw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
  if (storedRaw) {
    const stored = readJson(ONBOARDING_STORAGE_KEY, getDefaultOnboardingState())
    if (stored.checklist.dismissed) {
      return stored
    }
    const closed = closeWebOnboarding(stored)
    writeJson(ONBOARDING_STORAGE_KEY, closed)
    return closed
  }
  const closed = closeWebOnboarding(getDefaultOnboardingState())
  // Why: a paired web client already has a runtime host. Desktop first-run
  // onboarding would incorrectly probe browser-local tools and block the client.
  writeJson(ONBOARDING_STORAGE_KEY, closed)
  return closed
}

/** Resolve the localStorage key for a session partition. Non-'local' hosts get
 *  a host-suffixed key so their sessions never clobber the local one. */
function sessionStorageKeyForHost(hostId?: string | null): string {
  const resolved = normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID
  return resolved === LOCAL_EXECUTION_HOST_ID
    ? SESSION_STORAGE_KEY
    : `${SESSION_STORAGE_KEY}.${resolved}`
}

function getStoredWorkspaceSession(hostId?: string | null): WorkspaceSessionState {
  const resolvedHostId = normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID
  if (resolvedHostId !== LOCAL_EXECUTION_HOST_ID) {
    return sanitizeWebRuntimeWorkspaceSession(
      readJson(sessionStorageKeyForHost(resolvedHostId), getDefaultWorkspaceSession())
    )
  }
  const localSession = sanitizeWebRuntimeWorkspaceSession(
    readJson(SESSION_STORAGE_KEY, getDefaultWorkspaceSession())
  )
  if (!requireActiveEnvironmentOrNull()) {
    return localSession
  }
  const ui = readWebUIState()
  // Why: paired web clients mirror host session-tabs after startup. Replaying
  // browser-local terminal handles first creates stale remote PTYs and errors.
  return sanitizeWebRuntimeWorkspaceSession({
    ...getDefaultWorkspaceSession(),
    activeRepoId: ui.lastActiveRepoId,
    activeWorktreeId: ui.lastActiveWorktreeId,
    lastVisitedAtByWorktreeId: localSession.lastVisitedAtByWorktreeId
  })
}

function closeWebOnboarding(base: OnboardingState): OnboardingState {
  return {
    ...base,
    flowVersion: ONBOARDING_FLOW_VERSION,
    closedAt: Date.now(),
    outcome: 'dismissed',
    checklist: {
      ...base.checklist,
      dismissed: true
    }
  }
}

function mergeSettings(
  base: GlobalSettings,
  updates: Partial<GlobalSettings>,
  options: { preserveAutoRenameBranchFromWorkUpdate?: boolean } = {}
): GlobalSettings {
  const defaults = getDefaultSettings('~')
  const merged = {
    ...base,
    ...updates,
    notifications: {
      ...base.notifications,
      ...updates.notifications
    },
    disabledTuiAgents: normalizeDisabledTuiAgents(
      updates.disabledTuiAgents ?? base.disabledTuiAgents
    ),
    agentDefaultArgs: normalizeTuiAgentArgsRecord(
      updates.agentDefaultArgs ?? base.agentDefaultArgs
    ),
    agentDefaultEnv: normalizeTuiAgentEnvRecord(updates.agentDefaultEnv ?? base.agentDefaultEnv),
    voice: {
      ...(base.voice ?? defaults.voice),
      ...updates.voice
    } as NonNullable<GlobalSettings['voice']>,
    activeRuntimeEnvironmentId: activeEnvironment?.id ?? updates.activeRuntimeEnvironmentId ?? null,
    terminalCustomThemes: normalizeTerminalCustomThemes(
      updates.terminalCustomThemes ?? base.terminalCustomThemes
    ),
    uiLanguage: normalizeUiLanguage(updates.uiLanguage ?? base.uiLanguage)
  }
  return {
    ...merged,
    ...normalizeAutoRenameBranchFromWorkDefaultOn(merged, {
      preserveExplicitValue: options.preserveAutoRenameBranchFromWorkUpdate
    })
  }
}

async function listAllRuntimeDetectedWorktrees(): Promise<Worktree[]> {
  if (cachedDetectedWorktrees && Date.now() - cachedDetectedWorktrees.loadedAt < 5_000) {
    return cachedDetectedWorktrees.worktrees
  }

  const repos = (
    await callRuntimeProcedure((client, options) => client.repo.list(undefined, options))
  ).repos
  const detectedLists = await Promise.all(
    repos.map((repo) => callRuntimeDetectedWorktrees(repo.id))
  )
  const worktrees = detectedLists.flatMap((result) => result.worktrees)
  cachedDetectedWorktrees = { loadedAt: Date.now(), worktrees }
  return worktrees
}

async function callRuntimeDetectedWorktrees(repoId: string): Promise<DetectedWorktreeListResult> {
  try {
    return await callRuntimeProcedure(
      (client, options) => client.worktree.detectedList({ repo: repoId }, options),
      { timeoutMs: 15_000 }
    )
  } catch (error) {
    if (!(error instanceof ORPCError) || error.code !== 'method_not_found') {
      throw error
    }
  }

  const legacy = await callRuntimeProcedure(
    (client, options) =>
      client.worktree.list({ repo: repoId, limit: WEB_RUNTIME_WORKTREE_LIST_LIMIT }, options),
    { timeoutMs: 15_000 }
  )
  return toLegacyDetectedWorktreeResult(repoId, legacy.worktrees)
}

function toLegacyDetectedWorktreeResult(
  repoId: string,
  worktrees: Worktree[]
): DetectedWorktreeListResult {
  return {
    repoId,
    authoritative: true,
    source: 'session-fallback',
    worktrees: worktrees.map((worktree) => ({
      ...worktree,
      ownership: 'yiru-managed',
      selectedCheckout: false,
      visible: true
    }))
  }
}

async function resolveRuntimeWorktreeByPath(worktreePath: string): Promise<Worktree> {
  // Why: hidden-but-open worktrees must still resolve for git/file operations.
  // `worktree.list` is sidebar-visible only, so path resolution uses detected rows.
  const worktrees = await listAllRuntimeDetectedWorktrees()
  const match = worktrees
    .map((worktree) => ({
      worktree,
      relativePath: relativePathInsideRoot(worktree.path, worktreePath)
    }))
    .filter((entry) => entry.relativePath !== null)
    .sort((a, b) => b.worktree.path.length - a.worktree.path.length)[0]
  if (!match) {
    throw new Error(`No runtime worktree owns ${worktreePath}`)
  }
  return match.worktree
}

async function resolveRuntimeFilePath(
  filePath: string,
  preferredWorktreePath?: string
): Promise<{ worktree: Worktree; relativePath: string }> {
  const worktree = preferredWorktreePath
    ? await resolveRuntimeWorktreeByPath(preferredWorktreePath)
    : await resolveRuntimeWorktreeByPath(filePath)
  const relativePath = relativePathInsideRoot(worktree.path, filePath)
  if (relativePath === null) {
    throw new Error(`File is outside runtime worktree: ${filePath}`)
  }
  return { worktree, relativePath }
}

async function mutateGitPath(
  mutation: keyof typeof GIT_PATH_MUTATION_SELECTORS,
  worktreePath: string,
  filePath: string
): Promise<void> {
  const file = await resolveRuntimeFilePath(filePath, worktreePath)
  await callSelectedRuntimeProcedure(GIT_PATH_MUTATION_SELECTORS[mutation], {
    worktree: toRuntimeWorktreeSelector(file.worktree.id),
    filePath: file.relativePath
  })
}

async function mutateGitPaths(
  mutation: keyof typeof GIT_PATHS_MUTATION_SELECTORS,
  worktreePath: string,
  filePaths: string[]
): Promise<void> {
  const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
  await callSelectedRuntimeProcedure(GIT_PATHS_MUTATION_SELECTORS[mutation], {
    worktree: toRuntimeWorktreeSelector(worktree.id),
    filePaths
  })
}

function getBrowserPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Windows')) {
    return 'win32'
  }
  if (navigator.userAgent.includes('Linux')) {
    return 'linux'
  }
  return 'darwin'
}

function readJson<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return cloneJson(fallback)
  }
  try {
    return { ...cloneJson(fallback), ...JSON.parse(raw) } as T
  } catch {
    return cloneJson(fallback)
  }
}

function writeJson<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function withFallback<T extends object>(target: T, path: string[]): T {
  return new Proxy(target, {
    get(current, property, receiver) {
      if (property in current) {
        const value = Reflect.get(current, property, receiver) as unknown
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return withFallback(value as object, [...path, String(property)])
        }
        return value
      }
      return createFallbackProxy([...path, String(property)])
    }
  })
}

function createFallbackProxy(
  path: string[],
  applyOverride?: (path: string[], args: unknown[]) => unknown
): never {
  const fn = () => undefined
  return new Proxy(fn, {
    get(_target, property) {
      if (property === 'then') {
        return undefined
      }
      return createFallbackProxy([...path, String(property)], applyOverride)
    },
    apply(_target, _thisArg, args) {
      if (applyOverride) {
        return applyOverride(path, args)
      }
      return getFallbackResult(path, args)
    }
  }) as never
}

function getFallbackResult(path: string[], args: unknown[]): unknown {
  const name = path.at(-1) ?? ''
  if (name.startsWith('on')) {
    return noopUnsubscribe
  }
  if (name.startsWith('is') || name.startsWith('has') || name === 'pathExists') {
    return Promise.resolve(false)
  }
  if (name.startsWith('list') || name.startsWith('detect')) {
    return Promise.resolve([])
  }
  if (name.startsWith('preview')) {
    return Promise.resolve({ found: false, diff: {}, unsupportedKeys: [] })
  }
  if (name.startsWith('get') && name.endsWith('Status')) {
    return Promise.resolve([])
  }
  if (name === 'write' || name === 'resize' || name === 'reportGeometry') {
    return undefined
  }
  if (args.length === 0 && (name === 'getZoomLevel' || name === 'declarePendingPaneSerializer')) {
    return 0
  }
  return Promise.resolve(undefined)
}

function noopUnsubscribe(): void {}
