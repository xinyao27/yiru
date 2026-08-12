import { getComposerRepoWorktreeBranches } from '@yiru/workbench-model/review'
import { shouldPreserveWorkspaceSourceOnRepoChange } from '@yiru/workbench-model/workspace'
import type { PersistedTrustedYiruHooks } from '@yiru/workbench-model/workspace'
import { cn } from 'cnfast'
import { useState, useEffect, useMemo, useRef } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, Keyboard } from 'react-native'

import { MobileAgentIcon } from '~/components/agent-icon'
import { BottomDrawer, BottomDrawerModalHost } from '~/components/bottom-drawer'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { MobileGlassSurface } from '~/components/glass/surface'
import { SelectionDrawer, type SelectionDrawerOption } from '~/components/selection-drawer'
import { SettingsToggleRow } from '~/components/settings-toggle-row'
import { CaretDown as ChevronDown, CaretUp as ChevronUp } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import { getCachedRepos, setCachedRepos } from '../cache/repo-cache'
import type { RpcClient } from '../transport/rpc-client'
import { repoColor } from '../workspace/repo-color'
import { useLastVisitedWorktreeRepoId } from '../worktree/use-last-visited-repo'
import {
  NEW_WORKSPACE_AGENT_OPTIONS as AGENT_OPTIONS,
  NEW_WORKSPACE_BLANK_AGENT as BLANK_TERMINAL,
  pickPreferredNewWorkspaceAgent,
  resolveNewWorkspaceAgentSelection,
  type NewWorkspaceAgentOption as AgentOption
} from './agent-selection'
import { createBlankWorkspace } from './blank-workspace-create'
import {
  getMobileNewWorkspaceDialogEligibleRepos,
  refreshMobileNewWorkspaceDialogSelectedRepo,
  resolveMobileNewWorkspaceDialogRepoId
} from './dialog-repo-selection'
import { getSuggestedCreatureName } from './name-suggestion'
import {
  readDetectedAgentIds,
  readGlabInstalled,
  readRepoHooks,
  readTrustedYiruHooks,
  readWorkspaceRepoList,
  readWorkspaceRepos,
  readWorkspaceRuntimeSettings,
  type WorkspaceRepo as Repo,
  type WorkspaceRuntimeSettings as RuntimeSettings,
  type WorkspaceSetupRunPolicy as SetupRunPolicy
} from './rpc-payloads'
import {
  isSetupHookTrusted,
  persistSetupHookTrustApproval,
  wasSetupHookPreviouslyApproved,
  type SetupHookTrust
} from './setup-hook-trust'
import { SetupHookTrustDrawer, type SetupTrustPrompt } from './setup-hook-trust-drawer'
import type { SmartModeAvailabilityInput } from './smart-source-modes'
import { deriveRepoSlug, type PasteRepoCandidate } from './smart-source-paste-intent'
import { SmartWorkspaceAdvancedFields } from './smart-workspace-advanced-fields'
import { SmartWorkspaceSourceDrawer } from './smart-workspace-source-drawer'
import { SmartWorkspaceSourceField } from './smart-workspace-source-field'
import { createWorkspaceFromComposerSource } from './source-workspace-create'
import { SubmitAction } from './submit-action/action'
import {
  isMobileTuiAgent,
  isMobileTuiAgentEnabled,
  MOBILE_TUI_AGENT_LAUNCH_COMMANDS
} from './tui-agents'
import { useMobileComposerSource } from './use-composer-source'
import { normalizeWorkspaceAgent } from './workspace-agent-selection'

type SetupDecision = 'inherit' | 'run' | 'skip'

type SetupHookDetails = {
  repoId: string
  command: string | null
  source: string | null
  trust: SetupHookTrust | null
  runPolicy: SetupRunPolicy
}

type DetectedAgentIdsState = {
  connectionId: string | null
  ids: Set<string>
}

type CreateOptions = {
  setupOverride?: Exclude<SetupDecision, 'inherit'>
  approvedSetupContentHash?: string
}

type NewWorktreeDrawerView = 'form' | 'source' | 'repo' | 'agent' | 'trust'

function repoBadgeColor(repo: Repo | null): string {
  return repo?.badgeColor || repoColor(repo?.displayName ?? 'repository')
}

// ── Main modal ──────────────────────────────────────────────────────

type NewWorkspaceModalProps = {
  visible: boolean
  client: RpcClient | null
  hostId?: string
  hostCapabilities?: readonly string[]
  // Why: existing worktree paths from the host so we can pick a unique
  // marine-creature default when the user leaves the name blank, matching
  // the desktop UI's behavior. The "already exists locally" collision is
  // on the on-disk directory basename, so paths (not displayNames) are
  // what the suggestion logic must dedupe against.
  existingWorktreePaths?: readonly string[]
  existingWorktrees?: readonly { repoId: string; branch: string }[]
  onCreated: (worktreeId: string, name: string) => void
  onClose: () => void
}

export function NewWorkspaceModal({
  visible,
  client,
  hostId,
  hostCapabilities,
  existingWorktreePaths,
  existingWorktrees,
  onCreated,
  onClose
}: NewWorkspaceModalProps): React.JSX.Element {
  const openEpochRef = useRef(0)
  const wasVisibleRef = useRef(false)
  const clientEpochRef = useRef({ client, epoch: 0 })

  // Why: each drawer opening is a fresh form session; remounting resets local
  // form state before paint instead of clearing it in a visible-prop Effect.
  if (visible && !wasVisibleRef.current) {
    openEpochRef.current += 1
  }
  wasVisibleRef.current = visible
  if (clientEpochRef.current.client !== client) {
    clientEpochRef.current = { client, epoch: clientEpochRef.current.epoch + 1 }
  }

  return (
    <NewWorkspaceModalContent
      key={`${openEpochRef.current}:${clientEpochRef.current.epoch}`}
      visible={visible}
      client={client}
      hostId={hostId}
      hostCapabilities={hostCapabilities}
      existingWorktreePaths={existingWorktreePaths}
      existingWorktrees={existingWorktrees}
      onCreated={onCreated}
      onClose={onClose}
    />
  )
}

function NewWorkspaceModalContent({
  visible,
  client,
  hostId,
  hostCapabilities,
  existingWorktreePaths,
  existingWorktrees,
  onCreated,
  onClose
}: NewWorkspaceModalProps): React.JSX.Element {
  const [initialRepos] = useState(() => {
    const cached = hostId ? getCachedRepos(hostId) : null
    return cached ? readWorkspaceRepos(cached) : null
  })
  const [repos, setRepos] = useState<Repo[]>(initialRepos ?? [])
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [drawerView, setDrawerView] = useState<NewWorktreeDrawerView>('form')
  const createInFlightRef = useRef(false)
  const setupTrustActionInFlightRef = useRef(false)
  const [selectedAgentState, setSelectedAgent] = useState<AgentOption>(AGENT_OPTIONS[0]!)
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings | null>(null)
  const [detectedAgentIdsState, setDetectedAgentIdsState] = useState<DetectedAgentIdsState | null>(
    null
  )
  const [agentOverriddenState, setAgentOverridden] = useState(false)
  const [note, setNote] = useState('')
  const [gitlabAvailable, setGitLabAvailable] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [setupHookDetails, setSetupHookDetails] = useState<SetupHookDetails | null>(null)
  const [trustedYiruHooks, setTrustedYiruHooks] = useState<PersistedTrustedYiruHooks>({})
  const [setupTrustPrompt, setSetupTrustPrompt] = useState<SetupTrustPrompt | null>(null)
  const [setupDecisionChoice, setSetupDecisionChoice] = useState<Exclude<
    SetupDecision,
    'inherit'
  > | null>(null)
  const [runSetup, setRunSetup] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(initialRepos == null)
  const lastVisitedRepo = useLastVisitedWorktreeRepoId(hostId, visible)
  const selectedRepoWorktreeBranches = useMemo(
    () => getComposerRepoWorktreeBranches(existingWorktrees ?? [], selectedRepo?.id ?? null),
    [existingWorktrees, selectedRepo]
  )

  function transitionDrawer(nextView: NewWorktreeDrawerView): void {
    setDrawerView(nextView)
  }

  // The Smart source picker owns the workspace name AND the linked-source
  // selection: typing names the workspace and drives source search, and picking
  // a source resolves the base/branch/push metadata (matching desktop). The
  // creature-name fallback is only computed lazily at submit for a blank name.
  const composer = useMobileComposerSource({
    client,
    selectedRepoId: selectedRepo?.id ?? null,
    worktreeBranches: selectedRepoWorktreeBranches,
    onError: setError
  })

  const detectedAgentIds =
    detectedAgentIdsState?.connectionId === null ? detectedAgentIdsState.ids : null
  const activeSetupHookDetails =
    selectedRepo && setupHookDetails?.repoId === selectedRepo.id ? setupHookDetails : null
  const setupCommand = activeSetupHookDetails?.command ?? null
  const setupSource = activeSetupHookDetails?.source ?? null
  const setupTrust = activeSetupHookDetails?.trust ?? null
  const setupRunPolicy = activeSetupHookDetails?.runPolicy ?? 'run-by-default'
  const selectedAgentResolution = resolveNewWorkspaceAgentSelection({
    visible,
    selectedAgent: selectedAgentState,
    agentOverridden: agentOverriddenState,
    runtimeSettings,
    detectedAgentIds
  })
  // Why: agent preference repair is pure render dataflow; doing it here
  // avoids a stale selected-agent commit while preserving user overrides.
  if (
    selectedAgentState.id !== selectedAgentResolution.selectedAgent.id ||
    agentOverriddenState !== selectedAgentResolution.agentOverridden
  ) {
    setSelectedAgent(selectedAgentResolution.selectedAgent)
    setAgentOverridden(selectedAgentResolution.agentOverridden)
  }
  const selectedAgent = selectedAgentResolution.selectedAgent

  const selectedRepoIsGit = selectedRepo ? selectedRepo.kind !== 'folder' : true
  const sourceAvailability: SmartModeAvailabilityInput = {
    textOnly: selectedRepo != null && !selectedRepoIsGit,
    hasRepo: selectedRepo != null,
    githubAvailable: true,
    gitlabAvailable
  }
  const pasteRepos = useMemo<PasteRepoCandidate[]>(
    () =>
      repos.map((repo) => ({
        id: repo.id,
        displayName: repo.displayName,
        slug: deriveRepoSlug(repo)
      })),
    [repos]
  )

  useEffect(() => {
    if (!visible || !lastVisitedRepo.loaded || selectedRepo || repos.length === 0) {
      return
    }
    const eligibleRepos = getMobileNewWorkspaceDialogEligibleRepos(repos)
    const preferredRepoId = resolveMobileNewWorkspaceDialogRepoId({
      eligibleRepos,
      activeRepoId: lastVisitedRepo.repoId
    })
    const preferredRepo = repos.find((repo) => repo.id === preferredRepoId) ?? null
    if (preferredRepo) {
      setSelectedRepo(preferredRepo)
    }
  }, [lastVisitedRepo.loaded, lastVisitedRepo.repoId, repos, selectedRepo, visible])

  useEffect(() => {
    if (!visible || !client) {
      return
    }
    let stale = false

    if (repos.length === 0) {
      setLoading(true)
    }

    void callRuntimeOrpc(client, (runtime) => runtime.repo.list, undefined)
      .then((result) => {
        if (stale) {
          return
        }
        const nextRepos = readWorkspaceRepoList(result)
        setRepos(nextRepos)
        if (hostId) {
          setCachedRepos(hostId, nextRepos)
        }
        setSelectedRepo((current) => {
          // Why: the optimistic cache can include repos removed before the
          // fresh repo.list returns; never create against a stale repo id.
          return refreshMobileNewWorkspaceDialogSelectedRepo(nextRepos, current)
        })
      })
      .catch(() => {
        if (!stale) {
          setRepos([])
        }
      })
      .finally(() => {
        if (!stale) {
          setLoading(false)
        }
      })

    void (async () => {
      const settledResult = (entry: PromiseSettledResult<unknown>): unknown =>
        entry.status === 'fulfilled' ? entry.value : undefined
      const [settingsRes, uiRes, preflightRes] = await Promise.allSettled([
        callRuntimeOrpc(client, (runtime) => runtime.settings.get, undefined),
        callRuntimeOrpc(client, (runtime) => runtime.ui.get, undefined),
        callRuntimeOrpc(client, (runtime) => runtime.preflight.check, {})
      ])
      if (stale) {
        return
      }

      const settingsResult = settledResult(settingsRes)
      if (settingsResult !== undefined) {
        setRuntimeSettings(readWorkspaceRuntimeSettings(settingsResult))
      }
      const uiResult = settledResult(uiRes)
      if (uiResult !== undefined) {
        setTrustedYiruHooks(readTrustedYiruHooks(uiResult))
      }
      setGitLabAvailable(readGlabInstalled(settledResult(preflightRes)))
    })()
    return () => {
      stale = true
    }
  }, [visible, client, hostId])

  useEffect(() => {
    if (!visible || !client) {
      return
    }
    let stale = false
    void (async () => {
      try {
        const result = await callRuntimeOrpc(
          client,
          (runtime) => runtime.preflight.detectAgents,
          undefined
        )
        if (stale) {
          return
        }
        setDetectedAgentIdsState({
          connectionId: null,
          ids: new Set(readDetectedAgentIds(result))
        })
      } catch {
        if (!stale) {
          setDetectedAgentIdsState({ connectionId: null, ids: new Set() })
        }
      }
    })()
    return () => {
      stale = true
    }
  }, [client, visible])

  useEffect(() => {
    if (!client || !selectedRepo) {
      return
    }
    let stale = false
    void (async () => {
      try {
        const result = await callRuntimeOrpc(client, (runtime) => runtime.repo.hooks, {
          repo: `id:${selectedRepo.id}`
        })
        if (stale) {
          return
        }
        const hooks = readRepoHooks(result)
        setSetupHookDetails({
          repoId: selectedRepo.id,
          command: hooks.setupCommand,
          source: hooks.source,
          trust: hooks.setupTrust,
          runPolicy: hooks.setupRunPolicy
        })
        setSetupDecisionChoice(null)
        setRunSetup(hooks.setupRunPolicy !== 'skip-by-default')
        if (hooks.setupCommand && hooks.setupRunPolicy === 'ask') {
          setShowAdvanced(true)
        }
      } catch {
        if (!stale) {
          setSetupHookDetails({
            repoId: selectedRepo.id,
            command: null,
            source: null,
            trust: null,
            runPolicy: 'run-by-default'
          })
          setSetupDecisionChoice(null)
        }
      }
    })()
    return () => {
      stale = true
    }
  }, [client, selectedRepo])

  async function handleCreate(options: CreateOptions = {}) {
    if (!client || !selectedRepo || createInFlightRef.current) {
      return
    }
    createInFlightRef.current = true
    setCreating(true)
    setError('')

    try {
      let latestRuntimeSettings = runtimeSettings
      try {
        const result = await callRuntimeOrpc(client, (runtime) => runtime.settings.get, undefined)
        const settings = readWorkspaceRuntimeSettings(result)
        latestRuntimeSettings = settings
        setRuntimeSettings(settings)
      } catch {
        // Best-effort refresh; the runtime validates the same setting before spawning.
      }
      if (
        selectedAgent.id !== '__blank__' &&
        !isMobileTuiAgentEnabled(selectedAgent.id, latestRuntimeSettings?.disabledTuiAgents)
      ) {
        setSelectedAgent(pickPreferredNewWorkspaceAgent(latestRuntimeSettings, detectedAgentIds))
        setAgentOverridden(false)
        setError(
          translate(
            'mobile.newWorkspace.agentDisabled',
            'Selected agent is disabled. Choose an enabled agent before creating.'
          )
        )
        return
      }

      const command =
        selectedAgent.id !== '__blank__'
          ? (latestRuntimeSettings?.agentCmdOverrides?.[selectedAgent.id] ??
            (isMobileTuiAgent(selectedAgent.id)
              ? MOBILE_TUI_AGENT_LAUNCH_COMMANDS[selectedAgent.id]
              : undefined))
          : undefined

      // Why: blank name field — match desktop behavior by computing the
      // next available marine-creature name at submit time and passing it
      // to the server. The server's worktree.create rejects empty/invalid
      // names, so we must generate one client-side rather than letting the
      // server invent one. The pre-flight basename dedupe is only a hint;
      // the authoritative collision is checked server-side against git
      // branches/remotes/PRs, so we also retry-with-suffix on conflict.
      const trimmedName = composer.name.trim()
      const baseName = trimmedName || getSuggestedCreatureName(existingWorktreePaths ?? [])

      let setupDecision: SetupDecision = 'inherit'
      if (setupCommand) {
        if (options.setupOverride) {
          setupDecision = options.setupOverride
        } else if (setupRunPolicy === 'ask') {
          if (!setupDecisionChoice) {
            setError(
              translate(
                'mobile.newWorkspace.setupDecisionRequired',
                'Choose whether to run the setup script.'
              )
            )
            return
          }
          setupDecision = setupDecisionChoice
        } else {
          setupDecision = runSetup ? 'run' : 'skip'
        }
      }
      if (
        setupDecision === 'run' &&
        setupTrust &&
        setupTrust.contentHash !== options.approvedSetupContentHash &&
        !isSetupHookTrusted(trustedYiruHooks, selectedRepo.id, setupTrust.contentHash)
      ) {
        // Why: desktop prompts before running repo-owned yiru.yaml setup hooks.
        // Mobile stores the same trust hash so approvals carry across surfaces.
        setSetupTrustPrompt({
          repoId: selectedRepo.id,
          repoName: selectedRepo.displayName,
          scriptContent: setupTrust.scriptContent,
          contentHash: setupTrust.contentHash,
          previouslyApproved: wasSetupHookPreviouslyApproved(trustedYiruHooks, selectedRepo.id)
        })
        transitionDrawer('trust')
        return
      }

      const createdWithAgentId = selectedAgent.id !== '__blank__' ? selectedAgent.id : undefined
      const trimmedNote = note.trim() || undefined
      const createSelection = composer.createSelection
      const result = createSelection
        ? await createWorkspaceFromComposerSource({
            client,
            selection: createSelection,
            targetRepoId: selectedRepo.id,
            setupDecision,
            agent: {
              choice: normalizeWorkspaceAgent(selectedAgent.id) ?? 'blank',
              startupCommand: command,
              hostCapabilities
            },
            workspaceName: trimmedName || undefined,
            note: trimmedNote,
            nameIsAutoManaged: composer.isNameAutoManaged
          })
        : await createBlankWorkspace({
            client,
            repoId: selectedRepo.id,
            baseName,
            startupCommand: command,
            createdWithAgentId,
            hostCapabilities,
            comment: trimmedNote,
            setupDecision
          })
      if ('error' in result) {
        setError(result.error)
        return
      }
      onClose()
      onCreated(result.worktreeId, result.name)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : translate('mobile.newWorkspace.createFailed', 'Failed to create workspace')
      )
    } finally {
      createInFlightRef.current = false
      setCreating(false)
    }
  }

  const needsSetupChoice = Boolean(setupCommand) && setupRunPolicy === 'ask'
  const canCreate =
    selectedRepo != null && !creating && (!needsSetupChoice || setupDecisionChoice != null)
  const pickerAgentOptions = useMemo<SelectionDrawerOption<AgentOption>[]>(() => {
    const visible = AGENT_OPTIONS.filter(
      (agent) =>
        agent.id !== '__blank__' &&
        (detectedAgentIds === null || detectedAgentIds.has(agent.id)) &&
        isMobileTuiAgentEnabled(agent.id, runtimeSettings?.disabledTuiAgents)
    )
    return [...visible, BLANK_TERMINAL].map((agent) => ({
      id: agent.id,
      value: agent,
      label: agent.label,
      leading: <MobileAgentIcon agentId={agent.id} size={18} />
    }))
  }, [detectedAgentIds, runtimeSettings?.disabledTuiAgents])
  const repoPickerOptions = useMemo<SelectionDrawerOption<Repo>[]>(
    () =>
      repos.map((repo) => ({
        id: repo.id,
        value: repo,
        label: repo.displayName,
        leading: <View className="h-2 w-2" style={{ backgroundColor: repoBadgeColor(repo) }} />
      })),
    [repos]
  )

  function prepareSelectionPickerOpen(): void {
    // Why: picker taps can beat an open soft keyboard; dismissing it prevents the
    // keyboard from reopening under the picker drawer.
    Keyboard.dismiss()
  }

  function handleRepoSelected(repo: Repo): void {
    const repoChanged = repo.id !== selectedRepo?.id
    setSelectedRepo(repo)
    // Review and branch sources are repo-scoped and cannot survive a repo switch.
    if (repoChanged && !shouldPreserveWorkspaceSourceOnRepoChange()) {
      composer.handleClearSmartNameSelection()
    }
  }

  async function approveSetupTrust(alwaysTrust: boolean): Promise<void> {
    if (
      !client ||
      !setupTrustPrompt ||
      setupTrustActionInFlightRef.current ||
      createInFlightRef.current
    ) {
      return
    }
    setupTrustActionInFlightRef.current = true
    setCreating(true)
    try {
      const nextTrust = await persistSetupHookTrustApproval({
        client,
        trust: trustedYiruHooks,
        repoId: setupTrustPrompt.repoId,
        contentHash: setupTrustPrompt.contentHash,
        alwaysTrust
      })
      setTrustedYiruHooks(nextTrust)
      const approvedHash = setupTrustPrompt.contentHash
      setSetupTrustPrompt(null)
      transitionDrawer('form')
      await handleCreate({ setupOverride: 'run', approvedSetupContentHash: approvedHash })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : translate('mobile.newWorkspace.trustSetupFailed', 'Failed to trust setup script.')
      )
    } finally {
      setupTrustActionInFlightRef.current = false
      if (!createInFlightRef.current) {
        setCreating(false)
      }
    }
  }

  function closeSetupTrust(): void {
    if (setupTrustActionInFlightRef.current || createInFlightRef.current) {
      return
    }
    setSetupTrustPrompt(null)
    transitionDrawer('form')
  }

  function skipSetupTrust(): void {
    if (setupTrustActionInFlightRef.current || createInFlightRef.current) {
      return
    }
    closeSetupTrust()
    void handleCreate({ setupOverride: 'skip' })
  }

  return (
    // Why: the form and its pickers swap content inside one native sheet, so no
    // picker competes with a sheet that is still dismissing.
    <BottomDrawerModalHost
      visible={visible}
      dismissEnabled={drawerView !== 'trust' || !creating}
      onRequestClose={onClose}
    >
      <BottomDrawer
        visible={visible && drawerView === 'form'}
        onClose={onClose}
        title={translate('mobile.newWorkspace.title', 'Create Workspace')}
      >
        <View className="mb-3">
          <Text className="text-muted-foreground text-xs">
            {translate(
              'mobile.newWorkspace.subtitle',
              'Pick a repository and agent to spin up a new workspace.'
            )}
          </Text>
        </View>

        {loading ? (
          <View className="items-center py-6">
            <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
          </View>
        ) : repos.length === 0 ? (
          <View className="items-center py-6">
            <Text className="text-muted-foreground text-sm">
              {translate('mobile.newWorkspace.noRepositories', 'No repositories found')}
            </Text>
          </View>
        ) : (
          <>
            <View className="mb-3">
              <Text className="text-muted-foreground mb-1 text-xs font-medium">
                {translate('mobile.newWorkspace.repositoryLabel', 'Repository')}
              </Text>
              <MobileGlassPressable
                className="rounded-xl"
                contentClassName="flex-row items-center gap-2 px-3 py-3"
                onPress={() => {
                  prepareSelectionPickerOpen()
                  transitionDrawer('repo')
                }}
              >
                {selectedRepo ? (
                  <View
                    className="h-2 w-2"
                    style={{ backgroundColor: repoBadgeColor(selectedRepo) }}
                  />
                ) : null}
                <Text
                  className={cn(
                    'text-foreground flex-1 text-sm',
                    !selectedRepo && 'text-muted-foreground'
                  )}
                  numberOfLines={1}
                >
                  {selectedRepo?.displayName ??
                    translate('mobile.newWorkspace.selectRepository', 'Select a repository')}
                </Text>
                <ChevronDown size={14} colorClassName="accent-muted-foreground" />
              </MobileGlassPressable>
            </View>

            <SmartWorkspaceSourceField
              composer={composer}
              label={
                selectedRepoIsGit
                  ? translate('mobile.newWorkspace.nameOrCreateFromLabel', "Name or 'Create From'")
                  : translate('mobile.newWorkspace.workspaceNameLabel', 'Workspace name')
              }
              onBeforeOpen={() => setError('')}
              onOpenDrawer={() => transitionDrawer('source')}
            />

            {composer.forkPushWarning ? (
              <Text className="-mt-2 mb-3 text-xs text-amber-500">{composer.forkPushWarning}</Text>
            ) : null}

            <View className="mb-3">
              <Text className="text-muted-foreground mb-1 text-xs font-medium">
                {translate('mobile.newWorkspace.agentLabel', 'Agent')}
              </Text>
              <MobileGlassPressable
                className="rounded-xl"
                contentClassName="flex-row items-center gap-2 px-3 py-3"
                onPress={() => {
                  prepareSelectionPickerOpen()
                  transitionDrawer('agent')
                }}
              >
                <MobileAgentIcon agentId={selectedAgent.id} size={16} />
                <Text className="text-foreground flex-1 text-sm" numberOfLines={1}>
                  {selectedAgent.label}
                </Text>
                <ChevronDown size={14} colorClassName="accent-muted-foreground" />
              </MobileGlassPressable>
            </View>

            <Pressable
              className="mb-1 min-h-11 flex-row items-center gap-1 py-2"
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Text className="text-muted-foreground text-sm font-medium">
                {translate('mobile.newWorkspace.advanced', 'Advanced')}
              </Text>
              {showAdvanced ? (
                <ChevronUp size={14} colorClassName="accent-muted-foreground" />
              ) : (
                <ChevronDown size={14} colorClassName="accent-muted-foreground" />
              )}
            </Pressable>

            {showAdvanced && (
              <>
                <SmartWorkspaceAdvancedFields
                  composer={composer}
                  selectedRepoIsGit={selectedRepoIsGit}
                />

                <View className="mb-3">
                  <Text className="text-muted-foreground mb-1 text-xs font-medium">
                    {translate('mobile.newWorkspace.noteLabel', 'Note')}
                  </Text>
                  <MobileGlassSurface className="overflow-hidden rounded-xl" isInteractive>
                    <TextInput
                      className="text-foreground min-h-11 px-3 py-3 text-sm"
                      value={note}
                      onChangeText={setNote}
                      placeholder={translate('mobile.newWorkspace.notePlaceholder', 'Write a note')}
                      placeholderTextColorClassName="accent-muted-foreground"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </MobileGlassSurface>
                </View>

                {setupCommand ? (
                  <View className="mb-3">
                    <View className="mb-1 flex-row items-center justify-between">
                      <Text className="text-muted-foreground text-xs font-medium">
                        {translate('mobile.newWorkspace.setupScriptLabel', 'Setup script')}
                      </Text>
                      {setupSource && (
                        <View className="bg-secondary rounded-md px-2 py-1">
                          <Text className="text-muted-foreground text-xs font-semibold tracking-wide">
                            {setupSource === 'yiru.yaml'
                              ? translate('mobile.newWorkspace.setupSourceYiruYaml', 'YIRU.YAML')
                              : translate('mobile.newWorkspace.setupSourceHooks', 'HOOKS')}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View className="border-border bg-secondary rounded-2xl border p-3">
                      {setupRunPolicy === 'ask' ? (
                        <MobileGlassGroup className="mb-2 flex-row gap-2" spacing={8}>
                          <MobileGlassPressable
                            className="w-full rounded-full"
                            containerClassName="flex-1"
                            contentClassName="min-h-8 items-center justify-center rounded-full px-3"
                            isSelected={setupDecisionChoice === 'run'}
                            onPress={() => setSetupDecisionChoice('run')}
                          >
                            <Text className="text-foreground text-sm">
                              {translate('mobile.newWorkspace.setupRun', 'Run')}
                            </Text>
                          </MobileGlassPressable>
                          <MobileGlassPressable
                            className="w-full rounded-full"
                            containerClassName="flex-1"
                            contentClassName="min-h-8 items-center justify-center rounded-full px-3"
                            isSelected={setupDecisionChoice === 'skip'}
                            onPress={() => setSetupDecisionChoice('skip')}
                          >
                            <Text className="text-foreground text-sm">
                              {translate('mobile.newWorkspace.setupSkip', 'Skip')}
                            </Text>
                          </MobileGlassPressable>
                        </MobileGlassGroup>
                      ) : (
                        <SettingsToggleRow
                          label={translate(
                            'mobile.newWorkspace.runSetupCommand',
                            'Run setup command'
                          )}
                          onValueChange={setRunSetup}
                          value={runSetup}
                        />
                      )}
                      <View className="bg-background rounded-xl px-3 py-2">
                        <Text className="text-foreground font-mono text-xs">{setupCommand}</Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </>
            )}

            {error ? <Text className="text-destructive mb-3 text-xs">{error}</Text> : null}

            <View className="mt-2 min-h-11 items-end justify-center">
              {creating ? (
                <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
              ) : (
                <SubmitAction
                  disabled={!canCreate}
                  label={translate('mobile.newWorkspace.title', 'Create Workspace')}
                  onPress={() => void handleCreate()}
                />
              )}
            </View>
          </>
        )}
      </BottomDrawer>

      {/* Why: picker content stays outside the form ScrollView so the active step
          owns the sheet's scrolling behavior. */}
      <SmartWorkspaceSourceDrawer
        visible={visible && drawerView === 'source'}
        client={client}
        composer={composer}
        availability={sourceAvailability}
        repoId={selectedRepo?.id ?? null}
        repos={pasteRepos}
        onRepoChange={(repoId) => {
          const nextRepo = repos.find((repo) => repo.id === repoId)
          if (nextRepo) {
            setSelectedRepo(nextRepo)
          }
        }}
        onClose={() => transitionDrawer('form')}
      />

      <SelectionDrawer<Repo, string>
        visible={visible && drawerView === 'repo'}
        title={translate('mobile.newWorkspace.repositoryLabel', 'Repository')}
        options={repoPickerOptions}
        selectedId={selectedRepo?.id ?? null}
        onSelect={handleRepoSelected}
        onClose={() => transitionDrawer('form')}
      />

      <SelectionDrawer<AgentOption, string>
        visible={visible && drawerView === 'agent'}
        title={translate('mobile.newWorkspace.agentLabel', 'Agent')}
        options={pickerAgentOptions}
        selectedId={selectedAgent.id}
        onSelect={(agent) => {
          setAgentOverridden(true)
          setSelectedAgent(agent)
        }}
        onClose={() => transitionDrawer('form')}
      />

      <SetupHookTrustDrawer
        visible={visible && drawerView === 'trust' && setupTrustPrompt != null}
        prompt={setupTrustPrompt}
        busy={creating}
        onRunOnce={() => void approveSetupTrust(false)}
        onAlwaysTrust={() => void approveSetupTrust(true)}
        onDontRun={skipSetupTrust}
        onClose={closeSetupTrust}
      />
    </BottomDrawerModalHost>
  )
}
