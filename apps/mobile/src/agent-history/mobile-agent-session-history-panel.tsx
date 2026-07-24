import type { AiVaultScope, AiVaultSession } from '@yiru/workbench-model/agent'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'

import { CaretLeft as ChevronLeft, ArrowClockwise as RefreshCw } from '@/components/uniwind-icons'
import { SafeAreaView } from '@/components/uniwind-native-components'
import { cn } from '@/style/class-names'

import { triggerError, triggerSuccess } from '../platform/haptics'
import {
  buildMobileAiVaultResumeLaunch,
  createMobileAiVaultResumeMutationRegistry,
  readMobileRuntimeHostPlatform,
  readMobileRuntimeTerminalWindowsShell,
  resolveMobileAiVaultResumePlatform,
  resumeAiVaultSessionInTerminal,
  RESUME_RPC_TIMEOUT_MS,
  type MobileAiVaultResumeSettings
} from '../session/ai-vault-resume-launch'
import { getWorktreeLabel } from '../session/worktree-label'
import { useHostClient } from '../transport/client-context'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-types'
import { shouldShowMobileCurrentWorktreeBadge } from './agent-history-current-worktree-badge'
import {
  resolveMobileAiVaultSessionResumeTarget,
  type MobileAiVaultResumeFolderWorkspace,
  type MobileAiVaultResumeProjectGroup,
  type MobileAiVaultResumeRepo
} from './agent-history-resume-target'
import { buildMobileAgentHistorySections } from './agent-history-sections'
import { buildMobileAgentHistoryResumeActionState } from './agent-history-session-card'
import { styles } from './agent-history-styles'
import { MobileAgentSessionHistoryList } from './mobile-agent-session-history-list'
import { useMobileAgentHistoryState } from './use-mobile-agent-history-state'

export type MobileAgentSessionHistoryPanelProps = {
  hostId: string
  worktreeId: string
  name?: string
}

const SCOPE_TABS: { scope: AiVaultScope; label: string }[] = [
  { scope: 'workspace', label: 'Workspace' },
  { scope: 'project', label: 'Project' },
  { scope: 'all', label: 'All' }
]

export function MobileAgentSessionHistoryPanel({
  hostId,
  worktreeId,
  name = ''
}: MobileAgentSessionHistoryPanelProps) {
  const router = useRouter()
  const { client, state: connState } = useHostClient(hostId)
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [worktreesLoaded, setWorktreesLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null)
  const [resumeMessage, setResumeMessage] = useState<string | null>(null)
  const resumeLaunchInFlightRef = useRef(false)
  const resumeMutationRegistryRef = useRef(
    createMobileAiVaultResumeMutationRegistry(createMobileAiVaultResumeMutationId)
  )
  const worktreeLabel = getWorktreeLabel(name, worktreeId)

  // Why: the worktree list seeds the host-local scopePaths derivation and the
  // active-worktree path for the "current worktree" badge.
  useEffect(() => {
    if (!client || connState !== 'connected') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const worktreeResponse = await client.sendRequest('worktree.ps', { limit: 10000 })
        if (cancelled) {
          return
        }
        if (worktreeResponse.ok) {
          const result = (worktreeResponse as RpcSuccess).result as { worktrees: Worktree[] }
          setWorktrees(result.worktrees)
        }
      } catch {
        // Why: worktree list is best-effort context; the session scan still runs
        // (without it, scoped tabs can't narrow and fall back to the full list).
      } finally {
        // Why: mark loaded even on failure so a scoped tab proceeds with an
        // unscoped fetch instead of holding a spinner forever.
        if (!cancelled) {
          setWorktreesLoaded(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, connState])

  const {
    scope,
    screenState,
    refreshing,
    hostStatusResult,
    activeWorktreePath,
    scopeFilterPaths,
    onSelectScope,
    onRefresh,
    retry
  } = useMobileAgentHistoryState({ hostId, worktreeId, worktrees, worktreesLoaded })

  const sessions = screenState.kind === 'ready' ? screenState.sessions : EMPTY_SESSIONS
  const issues = screenState.kind === 'ready' ? screenState.issues : EMPTY_ISSUES
  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions]
  )
  const sections = useMemo(
    () =>
      buildMobileAgentHistorySections(sessions, {
        query,
        scope,
        scopeFilterPaths,
        activeWorktreePath,
        now: Date.now()
      }),
    [sessions, query, scope, scopeFilterPaths, activeWorktreePath]
  )

  const hostPlatform = useMemo(
    () => readMobileRuntimeHostPlatform(hostStatusResult),
    [hostStatusResult]
  )
  const hostTerminalWindowsShell = useMemo(
    () => readMobileRuntimeTerminalWindowsShell(hostStatusResult),
    [hostStatusResult]
  )

  const resumeActionStateBySessionId = useMemo(
    () => buildMobileAgentHistoryResumeActionState(sessions, resumingSessionId),
    [resumingSessionId, sessions]
  )

  const onResumeSession = useCallback(
    async (session: AiVaultSession): Promise<void> => {
      if (resumeLaunchInFlightRef.current) {
        return
      }
      if (!client || connState !== 'connected') {
        setResumeMessage('Waiting for host...')
        triggerError()
        return
      }
      if (!session.sessionId) {
        setResumeMessage('This session is missing a resume id.')
        triggerError()
        return
      }

      resumeLaunchInFlightRef.current = true
      setResumingSessionId(session.id)
      setResumeMessage(null)
      try {
        const {
          repos,
          folderWorkspaces,
          projectGroups,
          settings,
          worktrees: freshWorktrees
        } = await loadMobileResumeMetadata(client)
        const target = resolveMobileAiVaultSessionResumeTarget({
          session,
          activeWorktreeId: worktreeId,
          // Why: resolve against live worktrees so a workspace deleted or
          // archived since panel mount can't be picked; the mount-time list is
          // only a fallback when the fresh fetch fails.
          worktrees: freshWorktrees ?? worktrees,
          repos,
          folderWorkspaces,
          projectGroups
        })
        if (target.status !== 'ready') {
          setResumeMessage(target.message)
          triggerError()
          return
        }

        const platform = resolveMobileAiVaultResumePlatform(
          target.targetStatus,
          hostPlatform,
          target.workspacePath,
          target.terminalPlatform
        )
        if (!platform) {
          setResumeMessage('Unable to determine host platform.')
          triggerError()
          return
        }

        const launch = buildMobileAiVaultResumeLaunch({
          session,
          hostPlatform: platform,
          hostTerminalWindowsShell,
          settings
        })
        await resumeAiVaultSessionInTerminal(client, target.worktreeId, {
          ...launch,
          clientMutationId: resumeMutationRegistryRef.current.claim(session.id)
        })
        resumeMutationRegistryRef.current.releaseOnSuccess(session.id)
        triggerSuccess()
        setResumeMessage('Agent session queued.')
        router.push(
          `/h/${encodeURIComponent(hostId)}/session/${encodeURIComponent(target.worktreeId)}` as Parameters<
            typeof router.push
          >[0]
        )
      } catch (err) {
        triggerError()
        setResumeMessage(err instanceof Error ? err.message : 'Failed to resume session.')
      } finally {
        resumeLaunchInFlightRef.current = false
        setResumingSessionId(null)
      }
    },
    [
      client,
      connState,
      hostId,
      hostPlatform,
      hostTerminalWindowsShell,
      router,
      worktreeId,
      worktrees
    ]
  )

  return (
    <View className={styles.container}>
      <SafeAreaView className={styles.header} edges={['top']}>
        <View className={styles.topBar}>
          <Pressable
            className={cn(styles.backButton, styles.backButtonPressedActive)}
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Back"
          >
            <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
          </Pressable>
          <View className={styles.titleBlock}>
            <Text className={styles.title} numberOfLines={1}>
              Agent Session History
            </Text>
            <Text className={styles.meta} numberOfLines={1}>
              {worktreeLabel}
            </Text>
          </View>
          <Pressable
            className={cn(styles.refreshButton, styles.refreshButtonPressedActive)}
            onPress={() => void onRefresh()}
            hitSlop={8}
            accessibilityLabel="Refresh agent sessions"
          >
            <RefreshCw size={18} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      </SafeAreaView>

      {screenState.kind === 'loading' ? (
        <View className={styles.state}>
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        </View>
      ) : screenState.kind === 'unsupported' ? (
        <View className={styles.state}>
          <Text className={styles.stateTitle}>Agent Session History Unavailable</Text>
          <Text className={styles.stateText}>
            Update Yiru on this host to browse agent session history.
          </Text>
        </View>
      ) : screenState.kind === 'error' ? (
        <View className={styles.state}>
          <Text className={styles.stateTitle}>Unable to Load</Text>
          <Text className={styles.stateText}>{screenState.message}</Text>
          <Pressable className={styles.retryButton} onPress={retry}>
            <Text className={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View className={styles.scopeTabs}>
            {SCOPE_TABS.map((tab) => {
              const active = scope === tab.scope
              return (
                <Pressable
                  key={tab.scope}
                  className={cn(styles.scopeTab, active && styles.scopeTabActive)}
                  onPress={() => onSelectScope(tab.scope)}
                >
                  <Text className={cn(styles.scopeTabText, active && styles.scopeTabTextActive)}>
                    {tab.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <View className={styles.searchRow}>
            <TextInput
              className={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search sessions, repo:, path:"
              placeholderTextColorClassName="accent-muted-foreground"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {issues.length > 0 ? (
            <View className={styles.noticeBanner}>
              <Text className={styles.noticeText}>
                {issues.length} {issues.length === 1 ? 'transcript' : 'transcripts'} skipped
              </Text>
            </View>
          ) : null}
          {resumeMessage ? (
            <View className={styles.resumeBanner}>
              <Text className={styles.resumeBannerText}>{resumeMessage}</Text>
            </View>
          ) : null}
          {sections.length === 0 ? (
            <View className={styles.state}>
              <Text className={styles.stateTitle}>No agent sessions</Text>
              <Text className={styles.stateText}>
                {query ? 'No sessions match your search.' : 'No past agent sessions in this scope.'}
              </Text>
            </View>
          ) : (
            <MobileAgentSessionHistoryList
              sections={sections}
              sessionsById={sessionsById}
              refreshing={refreshing}
              showCurrentWorktreeBadges={shouldShowMobileCurrentWorktreeBadge(scope)}
              resumeActionStateBySessionId={resumeActionStateBySessionId}
              onResume={onResumeSession}
              onRefresh={() => void onRefresh()}
            />
          )}
        </>
      )}
    </View>
  )
}

const EMPTY_SESSIONS: AiVaultSession[] = []
const EMPTY_ISSUES: { agent: AiVaultSession['agent']; path: string; message: string }[] = []

async function loadMobileResumeMetadata(client: Pick<RpcClient, 'sendRequest'>): Promise<{
  repos: MobileAiVaultResumeRepo[]
  folderWorkspaces: MobileAiVaultResumeFolderWorkspace[]
  projectGroups: MobileAiVaultResumeProjectGroup[]
  settings: MobileAiVaultResumeSettings | null
  worktrees: Worktree[] | null
}> {
  // Why: repo.list can enrich repo remote identities, so fetch resume-only
  // metadata after explicit user intent instead of delaying history browsing.
  // timeoutMs: without it a socket drop parks these on the reconnect waiter
  // for minutes, pinning the resume spinner (see RESUME_RPC_TIMEOUT_MS).
  const [
    repoResponse,
    folderWorkspaceResponse,
    projectGroupResponse,
    settingsResponse,
    worktreeResponse
  ] = await Promise.all([
    client.sendRequest('repo.list', undefined, { timeoutMs: RESUME_RPC_TIMEOUT_MS }),
    client
      .sendRequest('folderWorkspace.list', undefined, { timeoutMs: RESUME_RPC_TIMEOUT_MS })
      .catch(() => null),
    client
      .sendRequest('projectGroup.list', undefined, { timeoutMs: RESUME_RPC_TIMEOUT_MS })
      .catch(() => null),
    client
      .sendRequest('settings.get', undefined, { timeoutMs: RESUME_RPC_TIMEOUT_MS })
      .catch(() => null),
    client
      .sendRequest('worktree.ps', { limit: 10000 }, { timeoutMs: RESUME_RPC_TIMEOUT_MS })
      .catch(() => null)
  ])
  if (!repoResponse.ok) {
    throw new Error(repoResponse.error?.message || 'Unable to load workspace metadata.')
  }
  const repoResult = repoResponse.result as { repos?: MobileAiVaultResumeRepo[] }
  const folderWorkspaceResult =
    folderWorkspaceResponse?.ok === true
      ? (folderWorkspaceResponse.result as {
          folderWorkspaces?: MobileAiVaultResumeFolderWorkspace[]
        })
      : null
  const projectGroupResult =
    projectGroupResponse?.ok === true
      ? (projectGroupResponse.result as { groups?: MobileAiVaultResumeProjectGroup[] })
      : null
  const settingsResult =
    settingsResponse?.ok === true
      ? (settingsResponse.result as { settings?: MobileAiVaultResumeSettings })
      : null
  const worktreeResult =
    worktreeResponse?.ok === true ? (worktreeResponse.result as { worktrees?: Worktree[] }) : null
  return {
    repos: repoResult.repos ?? [],
    folderWorkspaces: folderWorkspaceResult?.folderWorkspaces ?? [],
    projectGroups: projectGroupResult?.groups ?? [],
    settings: settingsResult?.settings ?? null,
    worktrees: worktreeResult?.worktrees ?? null
  }
}

function createMobileAiVaultResumeMutationId(sessionId: string): string {
  const sessionPart = sessionId.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 64) || 'session'
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `ai-vault-resume:${sessionPart}:${Date.now().toString(36)}:${randomPart}`
}
