import type { AiVaultScope, AiVaultSession } from '@yiru/workbench-model/agent'
import { Stack, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Text, View } from 'react-native'

import { MobileContentSection } from '~/components/content-section'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassSegmentedControl } from '~/components/glass/segmented-control'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { triggerError, triggerSuccess } from '~/platform/haptics'
import {
  buildMobileAiVaultResumeLaunch,
  createMobileAiVaultResumeMutationRegistry,
  readMobileRuntimeHostPlatform,
  readMobileRuntimeTerminalWindowsShell,
  resolveMobileAiVaultResumePlatform,
  resumeAiVaultSessionInTerminal
} from '~/session/ai-vault-resume-launch'
import { getWorktreeLabel } from '~/session/worktree-label'
import { useHostClient } from '~/transport/client-context'
import type { RpcSuccess } from '~/transport/types'
import type { Worktree } from '~/workspace/list-types'

import { shouldShowMobileCurrentWorktreeBadge } from './current-worktree-badge'
import { MobileAgentSessionHistoryList } from './list'
import { createMobileAiVaultResumeMutationId, loadMobileResumeMetadata } from './resume-metadata'
import { resolveMobileAiVaultSessionResumeTarget } from './resume-target'
import { MobileAgentHistorySearchControl } from './search-control'
import { buildMobileAgentHistorySections } from './sections'
import { buildMobileAgentHistoryResumeActionState } from './session-card'
import { styles } from './styles'
import { useMobileAgentHistoryState } from './use-agent-history-state'

export type MobileAgentSessionHistoryPanelProps = {
  hostId: string
  worktreeId: string
  name?: string
}

const SCOPE_TABS: { value: AiVaultScope; label: string }[] = [
  { value: 'workspace', label: 'Workspace' },
  { value: 'project', label: 'Project' },
  { value: 'all', label: 'All' }
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
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          title: `History · ${worktreeLabel}`,
          headerRight:
            Platform.OS === 'ios'
              ? undefined
              : () => (
                  <MobileGlassIconButton
                    accessibilityLabel="Refresh agent history"
                    icon="refresh"
                    onPress={() => void onRefresh()}
                  />
                )
        }}
      />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel="Refresh agent sessions"
            icon="arrow.clockwise"
            onPress={() => void onRefresh()}
          />
        </Stack.Toolbar>
      ) : null}

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
          <MobileGlassTextButton className="mt-2" label="Retry" onPress={retry} />
        </View>
      ) : (
        <>
          <View className="px-3 pt-2">
            <MobileGlassSegmentedControl
              accessibilityLabel="Agent session scope"
              onChange={onSelectScope}
              options={SCOPE_TABS}
              value={scope}
            />
          </View>
          <View className="px-3 pt-2">
            <MobileAgentHistorySearchControl onChangeText={setQuery} value={query} />
          </View>
          {issues.length > 0 ? (
            <MobileContentSection className="mx-3 mt-2 rounded-xl p-2">
              <Text className="text-xs text-amber-500">
                {issues.length} {issues.length === 1 ? 'transcript' : 'transcripts'} skipped
              </Text>
            </MobileContentSection>
          ) : null}
          {resumeMessage ? (
            <MobileContentSection className="mx-3 mt-2 rounded-xl p-2">
              <Text className="text-muted-foreground text-xs">{resumeMessage}</Text>
            </MobileContentSection>
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
