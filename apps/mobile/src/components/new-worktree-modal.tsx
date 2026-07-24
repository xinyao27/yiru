import type { SshConnectionState } from '@yiru/runtime-protocol/ssh-connection'
import type { TuiAgent } from '@yiru/workbench-model/agent'
import { getComposerRepoWorktreeBranches } from '@yiru/workbench-model/review'
import { shouldPreserveWorkspaceSourceOnRepoChange } from '@yiru/workbench-model/workspace'
import type { PersistedTrustedYiruHooks } from '@yiru/workbench-model/workspace'
import { useState, useEffect, useMemo, useRef } from 'react'
import { View, Text, TextInput, Pressable, Switch, ActivityIndicator, Keyboard } from 'react-native'

import { CaretDown as ChevronDown, CaretUp as ChevronUp } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { getCachedRepos, setCachedRepos } from '../cache/repo-cache'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse, RpcSuccess } from '../transport/types'
import { createBlankWorkspace } from '../workspace-create/blank-workspace-create'
import type { SmartModeAvailabilityInput } from '../workspace-create/mobile-smart-source-modes'
import {
  isMobileTuiAgent,
  isMobileTuiAgentEnabled,
  MOBILE_TUI_AGENT_LAUNCH_COMMANDS
} from '../workspace-create/mobile-tui-agents'
import {
  isSetupHookTrusted,
  normalizeSetupHookTrust,
  persistSetupHookTrustApproval,
  wasSetupHookPreviouslyApproved,
  type SetupHookTrust
} from '../workspace-create/setup-hook-trust'
import {
  deriveRepoSlug,
  type PasteRepoCandidate
} from '../workspace-create/smart-source-paste-intent'
import { createWorkspaceFromComposerSource } from '../workspace-create/source-workspace-create'
import { useMobileComposerSource } from '../workspace-create/use-mobile-composer-source'
import { normalizeWorkspaceAgent } from '../workspace-create/workspace-agent-selection'
import {
  deriveWorkspaceSshGate,
  workspaceSshStatusLabel
} from '../workspace-create/workspace-ssh-gate'
import {
  getMobileNewWorkspaceDialogEligibleRepos,
  refreshMobileNewWorkspaceDialogSelectedRepo,
  resolveMobileNewWorkspaceDialogRepoId
} from '../worktree/new-workspace-dialog-repo-selection'
import { useLastVisitedWorktreeRepoId } from '../worktree/use-last-visited-worktree-repo'
import { BottomDrawer, BOTTOM_DRAWER_HIDE_DURATION_MS } from './bottom-drawer'
import { BottomDrawerModalHost } from './bottom-drawer-modal-host'
import { MobileAgentIcon } from './mobile-agent-icon'
import {
  NEW_WORKTREE_AGENT_OPTIONS as AGENT_OPTIONS,
  NEW_WORKTREE_BLANK_AGENT as BLANK_TERMINAL,
  pickPreferredNewWorktreeAgent,
  resolveNewWorktreeAgentSelection,
  type NewWorktreeAgentOption as AgentOption
} from './new-worktree-agent-selection'
import { PickerListDrawer } from './picker-list-drawer'
import { SetupHookTrustDrawer, type SetupTrustPrompt } from './setup-hook-trust-drawer'
import { SmartWorkspaceAdvancedFields } from './smart-workspace-advanced-fields'
import { SmartWorkspaceSourceDrawer } from './smart-workspace-source-drawer'
import { SmartWorkspaceSourceField } from './smart-workspace-source-field'
import { getSuggestedCreatureName } from './worktree-name-suggestion'

type Repo = {
  id: string
  displayName: string
  path: string
  badgeColor?: string
  connectionId?: string | null
  kind?: 'git' | 'folder'
  upstream?: { owner: string; repo: string } | null
  gitRemoteIdentity?: { remoteUrl?: string; canonicalKey?: string } | null
}

type SetupDecision = 'inherit' | 'run' | 'skip'
type SetupRunPolicy = 'ask' | 'run-by-default' | 'skip-by-default'
type RuntimeSettings = {
  defaultTuiAgent?: TuiAgent | 'blank' | null
  disabledTuiAgents?: TuiAgent[]
  agentCmdOverrides?: Record<string, string>
}

type RepoHooksResponse = {
  hooks: { scripts?: { setup?: string } } | null
  source: string | null
  setupRunPolicy?: SetupRunPolicy
  setupTrust?: SetupHookTrust
}

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

type NewWorktreeDrawerView = 'form' | 'transition' | 'source' | 'repo' | 'agent' | 'trust'

// Why: iOS cannot reliably present a second native modal until the first drawer's
// exit commits; one extra frame keeps transitions sequential on slower devices.
const NEW_WORKTREE_DRAWER_TRANSITION_MS = BOTTOM_DRAWER_HIDE_DURATION_MS + 16
function repoColor(name: string): string {
  const palette = ['#f97316', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f59e0b', '#6366f1']
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return palette[Math.abs(hash) % palette.length]!
}

function repoBadgeColor(repo: Repo | null): string {
  return repo?.badgeColor || repoColor(repo?.displayName ?? 'repository')
}

// ── Main modal ──────────────────────────────────────────────────────

type Props = {
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

export function NewWorktreeModal({
  visible,
  client,
  hostId,
  hostCapabilities,
  existingWorktreePaths,
  existingWorktrees,
  onCreated,
  onClose
}: Props) {
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
    <NewWorktreeModalContent
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

function NewWorktreeModalContent({
  visible,
  client,
  hostId,
  hostCapabilities,
  existingWorktreePaths,
  existingWorktrees,
  onCreated,
  onClose
}: Props) {
  const [initialRepos] = useState(() => (hostId ? (getCachedRepos(hostId) as Repo[] | null) : null))
  const [repos, setRepos] = useState<Repo[]>(initialRepos ?? [])
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [drawerView, setDrawerView] = useState<NewWorktreeDrawerView>('form')
  const drawerTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const createInFlightRef = useRef(false)
  const setupTrustActionInFlightRef = useRef(false)
  const [selectedAgentState, setSelectedAgent] = useState<AgentOption>(AGENT_OPTIONS[0]!)
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings | null>(null)
  const [detectedAgentIdsState, setDetectedAgentIdsState] = useState<DetectedAgentIdsState | null>(
    null
  )
  const [agentOverriddenState, setAgentOverridden] = useState(false)
  const [sshState, setSshState] = useState<SshConnectionState | null>(null)
  const [sshConnectingTargetId, setSshConnectingTargetId] = useState<string | null>(null)
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

  useEffect(() => {
    return () => {
      if (drawerTransitionTimerRef.current) {
        clearTimeout(drawerTransitionTimerRef.current)
      }
    }
  }, [])

  function transitionDrawer(nextView: Exclude<NewWorktreeDrawerView, 'transition'>): void {
    if (drawerTransitionTimerRef.current) {
      clearTimeout(drawerTransitionTimerRef.current)
    }
    setDrawerView('transition')
    drawerTransitionTimerRef.current = setTimeout(() => {
      drawerTransitionTimerRef.current = null
      setDrawerView(nextView)
    }, NEW_WORKTREE_DRAWER_TRANSITION_MS)
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

  const selectedRepoConnectionId = selectedRepo?.connectionId ?? null
  const sshGate = deriveWorkspaceSshGate({
    connectionId: selectedRepoConnectionId,
    state: sshState,
    connecting: sshConnectingTargetId === selectedRepoConnectionId
  })
  const detectedAgentIds =
    detectedAgentIdsState?.connectionId === selectedRepoConnectionId &&
    (selectedRepoConnectionId === null || sshGate.status === 'connected')
      ? detectedAgentIdsState.ids
      : null
  const activeSetupHookDetails =
    selectedRepo && setupHookDetails?.repoId === selectedRepo.id ? setupHookDetails : null
  const setupCommand = activeSetupHookDetails?.command ?? null
  const setupSource = activeSetupHookDetails?.source ?? null
  const setupTrust = activeSetupHookDetails?.trust ?? null
  const setupRunPolicy = activeSetupHookDetails?.runPolicy ?? 'run-by-default'
  const selectedAgentResolution = resolveNewWorktreeAgentSelection({
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

    void client
      .sendRequest('repo.list')
      .then((repoResponse) => {
        if (stale) {
          return
        }
        if (repoResponse.ok) {
          const result = (repoResponse as RpcSuccess).result as { repos: Repo[] }
          setRepos(result.repos)
          if (hostId) {
            setCachedRepos(hostId, result.repos)
          }
          setSelectedRepo((current) => {
            // Why: the optimistic cache can include repos removed before the
            // fresh repo.list returns; never create against a stale repo id.
            return refreshMobileNewWorkspaceDialogSelectedRepo(result.repos, current)
          })
        }
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
      const okResult = (entry: PromiseSettledResult<RpcResponse>): RpcSuccess | null =>
        entry.status === 'fulfilled' && entry.value.ok ? (entry.value as RpcSuccess) : null
      const [settingsRes, uiRes, preflightRes] = await Promise.allSettled([
        client.sendRequest('settings.get'),
        client.sendRequest('ui.get'),
        client.sendRequest('preflight.check')
      ])
      if (stale) {
        return
      }

      const settingsResult = okResult(settingsRes)
      if (settingsResult) {
        setRuntimeSettings((settingsResult.result as { settings: RuntimeSettings }).settings)
      }
      const uiResult = okResult(uiRes)
      if (uiResult) {
        const ui = (uiResult.result as { ui?: { trustedYiruHooks?: PersistedTrustedYiruHooks } }).ui
        setTrustedYiruHooks(ui?.trustedYiruHooks ?? {})
      }
      setGitLabAvailable(
        (okResult(preflightRes)?.result as { glab?: { installed?: boolean } } | undefined)?.glab
          ?.installed === true
      )
    })()
    return () => {
      stale = true
    }
  }, [visible, client, hostId])

  useEffect(() => {
    if (!visible || !client || !selectedRepoConnectionId) {
      return
    }
    let stale = false
    void client
      .sendRequest('ssh.getState', { targetId: selectedRepoConnectionId })
      .then((response) => {
        if (stale) {
          return
        }
        if (!response.ok) {
          throw new Error(response.error.message)
        }
        const state = (response as RpcSuccess).result as { state?: SshConnectionState | null }
        setSshState(
          state.state ?? {
            targetId: selectedRepoConnectionId,
            status: 'disconnected',
            error: null,
            reconnectAttempt: 0
          }
        )
      })
      .catch((err) => {
        if (!stale) {
          setSshState({
            targetId: selectedRepoConnectionId,
            status: 'error',
            error: err instanceof Error ? err.message : 'Failed to read SSH connection state.',
            reconnectAttempt: 0
          })
        }
      })
    return () => {
      stale = true
    }
  }, [client, selectedRepoConnectionId, visible])

  useEffect(() => {
    if (!visible || !client) {
      return
    }
    if (selectedRepoConnectionId && sshGate.status !== 'connected') {
      return
    }
    let stale = false
    void (async () => {
      try {
        const response = selectedRepoConnectionId
          ? await client.sendRequest('preflight.detectRemoteAgents', {
              connectionId: selectedRepoConnectionId
            })
          : await client.sendRequest('preflight.detectAgents')
        if (stale) {
          return
        }
        setDetectedAgentIdsState({
          connectionId: selectedRepoConnectionId,
          ids: response.ok ? new Set((response as RpcSuccess).result as string[]) : new Set()
        })
      } catch {
        if (!stale) {
          setDetectedAgentIdsState({ connectionId: selectedRepoConnectionId, ids: new Set() })
        }
      }
    })()
    return () => {
      stale = true
    }
  }, [client, selectedRepoConnectionId, sshGate.status, visible])

  useEffect(() => {
    if (!client || !selectedRepo) {
      return
    }
    let stale = false
    void (async () => {
      try {
        const response = await client.sendRequest('repo.hooks', {
          repo: `id:${selectedRepo.id}`
        })
        if (stale) {
          return
        }
        if (response.ok) {
          const result = (response as RpcSuccess).result as RepoHooksResponse
          const cmd = result.hooks?.scripts?.setup?.trim() || null
          const policy = result.setupRunPolicy ?? 'run-by-default'
          setSetupHookDetails({
            repoId: selectedRepo.id,
            command: cmd,
            source: result.source,
            trust: normalizeSetupHookTrust(result.setupTrust),
            runPolicy: policy
          })
          setSetupDecisionChoice(null)
          setRunSetup(policy !== 'skip-by-default')
          if (cmd && policy === 'ask') {
            setShowAdvanced(true)
          }
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

  async function connectSelectedSshRepo(): Promise<void> {
    if (!client || !selectedRepoConnectionId) {
      return
    }
    setSshConnectingTargetId(selectedRepoConnectionId)
    setSshState({
      targetId: selectedRepoConnectionId,
      status: 'connecting',
      error: null,
      reconnectAttempt: 0
    })
    try {
      const response = await client.sendRequest(
        'ssh.connect',
        { targetId: selectedRepoConnectionId },
        { timeoutMs: 120_000 }
      )
      if (!response.ok) {
        throw new Error(response.error.message)
      }
      const result = (response as RpcSuccess).result as { state?: SshConnectionState | null }
      setSshState(
        result.state ?? {
          targetId: selectedRepoConnectionId,
          status: 'connected',
          error: null,
          reconnectAttempt: 0
        }
      )
    } catch (err) {
      setSshState({
        targetId: selectedRepoConnectionId,
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to connect to SSH repository.',
        reconnectAttempt: 0
      })
    } finally {
      setSshConnectingTargetId((current) => (current === selectedRepoConnectionId ? null : current))
    }
  }

  async function handleCreate(options: CreateOptions = {}) {
    if (!client || !selectedRepo || createInFlightRef.current) {
      return
    }
    createInFlightRef.current = true
    setCreating(true)
    setError('')

    try {
      if (sshGate.requiresConnection) {
        setError(`Connect ${selectedRepo.displayName} before creating a workspace.`)
        return
      }
      let latestRuntimeSettings = runtimeSettings
      try {
        const settingsResponse = await client.sendRequest('settings.get')
        if (settingsResponse.ok) {
          const result = (settingsResponse as RpcSuccess).result as { settings: RuntimeSettings }
          latestRuntimeSettings = result.settings
          setRuntimeSettings(result.settings)
        }
      } catch {
        // Best-effort refresh; the runtime validates the same setting before spawning.
      }
      if (
        selectedAgent.id !== '__blank__' &&
        !isMobileTuiAgentEnabled(selectedAgent.id, latestRuntimeSettings?.disabledTuiAgents)
      ) {
        setSelectedAgent(pickPreferredNewWorktreeAgent(latestRuntimeSettings, detectedAgentIds))
        setAgentOverridden(false)
        setError('Selected agent is disabled. Choose an enabled agent before creating.')
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
            setError('Choose whether to run the setup script.')
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
      setError(e instanceof Error ? e.message : 'Failed to create workspace')
    } finally {
      createInFlightRef.current = false
      setCreating(false)
    }
  }

  const needsSetupChoice = Boolean(setupCommand) && setupRunPolicy === 'ask'
  const canCreate =
    selectedRepo != null &&
    !creating &&
    !sshGate.requiresConnection &&
    (!needsSetupChoice || setupDecisionChoice != null)
  const visibleAgentOptions =
    detectedAgentIds === null
      ? AGENT_OPTIONS.filter(
          (agent) =>
            agent.id !== '__blank__' &&
            isMobileTuiAgentEnabled(agent.id, runtimeSettings?.disabledTuiAgents)
        )
      : AGENT_OPTIONS.filter(
          (agent) =>
            agent.id !== '__blank__' &&
            detectedAgentIds.has(agent.id) &&
            isMobileTuiAgentEnabled(agent.id, runtimeSettings?.disabledTuiAgents)
        )
  const pickerAgentOptions = [...visibleAgentOptions, BLANK_TERMINAL]
  const repoPickerItems = useMemo(
    () => repos.map((repo) => ({ id: repo.id, label: repo.displayName, repo })),
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
      setError(err instanceof Error ? err.message : 'Failed to trust setup script.')
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
    // Why: hosting the form and every picker in one persistent native Modal makes
    // form → repo/agent transitions in-window view swaps, avoiding the iOS
    // dismiss-then-present race that left the dropdowns unresponsive. Native back
    // closes the flow from the form, routes the trust prompt through its in-flight
    // guard, and otherwise returns to the form from a picker.
    <BottomDrawerModalHost
      visible={visible}
      onRequestClose={() => {
        if (drawerView === 'form') {
          onClose()
        } else if (drawerView === 'trust') {
          closeSetupTrust()
        } else {
          transitionDrawer('form')
        }
      }}
    >
      <BottomDrawer visible={visible && drawerView === 'form'} onClose={onClose}>
        <View className={styles.header}>
          <Text className={styles.title}>Create Workspace</Text>
          <Text className={styles.subtitle}>
            Pick a repository and agent to spin up a new workspace.
          </Text>
        </View>

        {loading ? (
          <View className={styles.loadingContainer}>
            <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
          </View>
        ) : repos.length === 0 ? (
          <View className={styles.loadingContainer}>
            <Text className={styles.emptyText}>No repositories found</Text>
          </View>
        ) : (
          <>
            <View className={styles.field}>
              <Text className={styles.label}>Repository</Text>
              <Pressable
                className={styles.fieldButton}
                onPress={() => {
                  prepareSelectionPickerOpen()
                  transitionDrawer('repo')
                }}
              >
                {selectedRepo ? (
                  <View
                    className={styles.repoDot}
                    style={[{ backgroundColor: repoBadgeColor(selectedRepo) }]}
                  />
                ) : null}
                <Text
                  className={cn(
                    styles.fieldButtonText,
                    !selectedRepo && styles.fieldButtonPlaceholder
                  )}
                  numberOfLines={1}
                >
                  {selectedRepo?.displayName ?? 'Select a repository'}
                </Text>
                <ChevronDown size={14} colorClassName="accent-muted-foreground" />
              </Pressable>
            </View>

            <SmartWorkspaceSourceField
              composer={composer}
              label={selectedRepoIsGit ? "Name or 'Create From'" : 'Workspace name'}
              disabled={sshGate.requiresConnection}
              onBeforeOpen={() => setError('')}
              onOpenDrawer={() => transitionDrawer('source')}
            />

            {composer.forkPushWarning ? (
              <Text className={styles.sourceWarning}>{composer.forkPushWarning}</Text>
            ) : null}

            {selectedRepoConnectionId ? (
              <View className={styles.field}>
                <Text className={styles.label}>SSH Connection</Text>
                <View className={styles.sshBox}>
                  <View className={styles.sshRow}>
                    <View
                      className={cn(
                        styles.sshDot,
                        sshGate.status === 'connected'
                          ? styles.sshDotConnected
                          : sshGate.connectInProgress
                            ? styles.sshDotProgress
                            : styles.sshDotDisconnected
                      )}
                    />
                    <View className={styles.sshCopy}>
                      <Text className={styles.sshTitle} numberOfLines={1}>
                        {selectedRepo?.displayName ?? 'Remote repository'}
                      </Text>
                      <Text className={styles.sshSubtitle}>
                        {workspaceSshStatusLabel(sshGate.status)}
                      </Text>
                    </View>
                    {sshGate.status === 'connected' ? null : (
                      <Pressable
                        className={cn(
                          styles.sshConnectButton,
                          sshGate.connectInProgress && styles.disabled
                        )}
                        disabled={sshGate.connectInProgress}
                        onPress={() => void connectSelectedSshRepo()}
                      >
                        <Text className={styles.sshConnectText}>
                          {sshGate.connectInProgress ? 'Connecting...' : 'Connect'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  {sshGate.error ? (
                    <Text className={styles.errorInline}>{sshGate.error}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View className={styles.field}>
              <Text className={styles.label}>Agent</Text>
              <Pressable
                className={cn(styles.fieldButton, sshGate.requiresConnection && styles.disabled)}
                disabled={sshGate.requiresConnection}
                onPress={() => {
                  prepareSelectionPickerOpen()
                  transitionDrawer('agent')
                }}
              >
                <MobileAgentIcon agentId={selectedAgent.id} size={16} />
                <Text className={styles.fieldButtonText} numberOfLines={1}>
                  {sshGate.requiresConnection ? 'Connect repository first' : selectedAgent.label}
                </Text>
                <ChevronDown size={14} colorClassName="accent-muted-foreground" />
              </Pressable>
            </View>

            <Pressable
              className={styles.advancedToggle}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Text className={styles.advancedText}>Advanced</Text>
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

                <View className={styles.field}>
                  <Text className={styles.label}>Note</Text>
                  <TextInput
                    className={styles.input}
                    value={note}
                    onChangeText={setNote}
                    placeholder="Write a note"
                    placeholderTextColorClassName="accent-muted-foreground"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {setupCommand ? (
                  <View className={styles.field}>
                    <View className={styles.setupHeader}>
                      <Text className={styles.label}>Setup script</Text>
                      {setupSource && (
                        <View className={styles.sourceBadge}>
                          <Text className={styles.sourceBadgeText}>
                            {setupSource === 'yiru.yaml' ? 'YIRU.YAML' : 'HOOKS'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View className={styles.setupBox}>
                      {setupRunPolicy === 'ask' ? (
                        <View className={styles.setupChoiceRow}>
                          <Pressable
                            className={cn(
                              styles.setupChoiceButton,
                              setupDecisionChoice === 'run' && styles.setupChoiceButtonSelected
                            )}
                            onPress={() => setSetupDecisionChoice('run')}
                          >
                            <Text className={styles.setupChoiceText}>Run</Text>
                          </Pressable>
                          <Pressable
                            className={cn(
                              styles.setupChoiceButton,
                              setupDecisionChoice === 'skip' && styles.setupChoiceButtonSelected
                            )}
                            onPress={() => setSetupDecisionChoice('skip')}
                          >
                            <Text className={styles.setupChoiceText}>Skip</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <View className={styles.setupToggleRow}>
                          <Text className={styles.setupToggleLabel}>Run setup command</Text>
                          <Switch
                            style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                            value={runSetup}
                            onValueChange={setRunSetup}
                            trackColorOffClassName="accent-border"
                            trackColorOnClassName="accent-muted-foreground"
                            thumbColorClassName="accent-foreground"
                            ios_backgroundColorClassName="accent-border"
                          />
                        </View>
                      )}
                      <View className={styles.setupCommandBlock}>
                        <Text className={styles.setupCommand}>{setupCommand}</Text>
                      </View>
                    </View>
                  </View>
                ) : null}
              </>
            )}

            {error ? <Text className={styles.error}>{error}</Text> : null}

            <View className={styles.actions}>
              <Pressable
                className={cn(styles.createButton, !canCreate && styles.createButtonDisabled)}
                disabled={!canCreate}
                onPress={() => void handleCreate()}
              >
                {creating ? (
                  <ActivityIndicator size="small" colorClassName="accent-primary-foreground" />
                ) : (
                  <Text className={styles.createText}>
                    {sshGate.requiresConnection ? 'Connect Repository' : 'Create Workspace'}
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </BottomDrawer>

      {/* Why: list drawers stay outside the form's ScrollView, and the transition
          state lets each hosted overlay finish hiding before the next appears. */}
      <SmartWorkspaceSourceDrawer
        visible={visible && drawerView === 'source'}
        client={client}
        composer={composer}
        availability={sourceAvailability}
        repoId={selectedRepo?.id ?? null}
        repos={pasteRepos}
        sshReady={!sshGate.requiresConnection}
        onRepoChange={(repoId) => {
          const nextRepo = repos.find((repo) => repo.id === repoId)
          if (nextRepo) {
            setSelectedRepo(nextRepo)
          }
        }}
        onClose={() => transitionDrawer('form')}
      />

      <PickerListDrawer
        visible={visible && drawerView === 'repo'}
        title="Repository"
        items={repoPickerItems}
        selectedId={selectedRepo?.id ?? ''}
        onSelect={(item) => handleRepoSelected(item.repo)}
        onClose={() => transitionDrawer('form')}
        renderIcon={(item) => {
          return (
            <View
              className={styles.repoDot}
              style={[{ backgroundColor: repoBadgeColor(item.repo) }]}
            />
          )
        }}
      />

      <PickerListDrawer
        visible={visible && drawerView === 'agent'}
        title="Agent"
        items={pickerAgentOptions}
        selectedId={selectedAgent.id}
        onSelect={(agent) => {
          setAgentOverridden(true)
          setSelectedAgent(agent)
        }}
        onClose={() => transitionDrawer('form')}
        renderIcon={(agent) => <MobileAgentIcon agentId={agent.id} size={18} />}
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

const styles = {
  header: cn('px-1 mb-3'),
  title: cn('text-[15px] font-semibold text-foreground'),
  subtitle: cn('text-[13px] text-muted-foreground/60 mt-[2px]'),
  loadingContainer: cn('py-6 items-center'),
  emptyText: cn('text-muted-foreground text-[14px]'),
  field: cn('mb-3'),
  label: cn('text-[13px] font-medium text-muted-foreground mb-1'),
  labelHint: cn('font-normal text-muted-foreground/60'),
  fieldButton: cn(
    'flex-row items-center gap-2 bg-secondary rounded-none px-3 py-2 ios:py-2.5 border border-border'
  ),
  fieldButtonText: cn('flex-1 text-[14px] text-foreground'),
  fieldButtonPlaceholder: cn('text-muted-foreground/60'),
  repoDot: cn('w-2 h-2 rounded-none'),
  disabled: cn('opacity-[0.55]'),
  sshBox: cn('bg-secondary rounded-none border border-border px-3 py-2 gap-1'),
  sshRow: cn('flex-row items-center gap-2'),
  sshDot: cn('w-2 h-2 rounded-none'),
  sshDotConnected: cn('bg-green-500'),
  sshDotProgress: cn('bg-amber-500'),
  sshDotDisconnected: cn('bg-destructive'),
  sshCopy: cn('flex-1 min-w-0'),
  sshTitle: cn('text-[14px] text-foreground font-semibold'),
  sshSubtitle: cn('text-[12px] text-muted-foreground mt-[1px]'),
  sshConnectButton: cn('rounded-none border border-border px-2 py-1'),
  sshConnectText: cn('text-foreground text-[12px] font-semibold'),
  errorInline: cn('text-destructive text-[12px]'),
  input: cn(
    'bg-secondary text-foreground rounded-none px-3 py-2 ios:py-2.5 text-[14px] border border-border'
  ),
  error: cn('text-destructive text-[13px] mb-3'),
  sourceWarning: cn('mt-[-8px] mb-3 text-[12px] text-amber-500'),
  advancedToggle: cn('flex-row items-center gap-1 py-2 mb-1'),
  advancedText: cn('text-[14px] font-medium text-muted-foreground'),
  setupHeader: cn('flex-row items-center justify-between mb-1'),
  sourceBadge: cn('bg-secondary rounded-none px-1.5 py-[2px]'),
  sourceBadgeText: cn('text-[10px] font-semibold text-muted-foreground/60 tracking-[0.5px]'),
  setupBox: cn('bg-secondary rounded-none border border-border p-3'),
  setupToggleRow: cn('flex-row items-center justify-between mb-2'),
  setupToggleLabel: cn('text-[13px] text-muted-foreground'),
  setupChoiceRow: cn('flex-row gap-2 mb-2'),
  setupChoiceButton: cn('flex-1 items-center border border-border rounded-none py-2'),
  setupChoiceButtonSelected: cn('bg-card border-muted-foreground'),
  setupChoiceText: cn('text-[13px] font-semibold text-foreground'),
  setupCommandBlock: cn('bg-background rounded-none px-2.5 py-2'),
  setupCommand: cn('text-[13px] font-mono text-foreground'),
  actions: cn('flex-row justify-end mt-2'),
  createButton: cn('bg-foreground px-4 py-2 rounded-none min-w-40 items-center'),
  createButtonDisabled: cn('opacity-[0.4]'),
  createText: cn('text-background text-[14px] font-semibold')
} as const
