import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { selectCoworkingCanControl } from '~renderer/components/coworking/selectors'
import type { CoworkingWorkspaceRoute } from '~renderer/components/coworking/types'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store'
import type {
  CoworkingGitDiffResult,
  CoworkingGitHistoryEntry,
  CoworkingGitHistoryResult,
  CoworkingGitStatusEntry,
  CoworkingGitStatusResult
} from '~shared/coworking/operation-contract'

import { getCoworkingGitStatusEntryKey } from './git-changes-list'
import { CoworkingGitDiffPane } from './git-diff-pane'
import { CoworkingGitSidebar, type CoworkingGitSidebarMode } from './git-sidebar'
import { CoworkingMutationOutcomeNotice } from './mutation-outcome-notice'
import {
  parseCoworkingGitDiffResult,
  parseCoworkingGitHistoryResult,
  parseCoworkingGitStatusResult,
  parseCoworkingMutationResult
} from './owner-result-validation'
import { reportCoworkingGitMutationError } from './workspace-mutation-feedback'
import {
  invokeCoworkingWorkspaceMutation,
  invokeCoworkingWorkspaceRead,
  CoworkingWorkspaceOperationError
} from './workspace-operation'
import { useCoworkingWorktreeOperationRoute } from './worktree-route'

export function CoworkingGitPane({ route }: { route: CoworkingWorkspaceRoute }): React.JSX.Element {
  const operationRoute = useCoworkingWorktreeOperationRoute(route)
  const canControl = useAppStore((state) => selectCoworkingCanControl(state, operationRoute))
  const [status, setStatus] = useState<CoworkingGitStatusResult | null>(null)
  const [history, setHistory] = useState<CoworkingGitHistoryResult | null>(null)
  const [mode, setMode] = useState<CoworkingGitSidebarMode>('changes')
  const [selectedStatus, setSelectedStatus] = useState<CoworkingGitStatusEntry | null>(null)
  const [selectedHistory, setSelectedHistory] = useState<CoworkingGitHistoryEntry | null>(null)
  const [diff, setDiff] = useState<CoworkingGitDiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffUnavailable, setDiffUnavailable] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [mutationOutcomeUnknown, setMutationOutcomeUnknown] = useState(false)
  const [sidebarView, setSidebarView] = useState<'list' | 'diff'>('list')
  const canMutate = canControl && !mutationOutcomeUnknown
  const requestSequence = useRef(0)
  const diffRequestSequence = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++requestSequence.current
    setLoading(true)
    setUnavailable(false)
    try {
      const [statusValue, historyValue] = await Promise.all([
        invokeCoworkingWorkspaceRead(operationRoute, 'git.status', {}),
        invokeCoworkingWorkspaceRead(operationRoute, 'git.history', { limit: 100 })
      ])
      const nextStatus = parseCoworkingGitStatusResult(statusValue)
      const nextHistory = parseCoworkingGitHistoryResult(historyValue)
      if (request === requestSequence.current) {
        setStatus(nextStatus)
        setHistory(nextHistory)
      }
    } catch (error) {
      if (request === requestSequence.current && !isStaleRouteError(error)) {
        setUnavailable(true)
        toast.error(
          translate(
            'auto.components.coworking.CoworkingGitPane.refreshFailed',
            'Could not load Git state.'
          )
        )
      }
    } finally {
      if (request === requestSequence.current) {
        setLoading(false)
      }
    }
  }, [operationRoute])

  useEffect(() => {
    void refresh()
    return () => {
      requestSequence.current += 1
      diffRequestSequence.current += 1
    }
  }, [refresh])

  const selectStatus = async (entry: CoworkingGitStatusEntry): Promise<void> => {
    const request = ++diffRequestSequence.current
    setMode('changes')
    setSelectedStatus(entry)
    setSelectedHistory(null)
    setDiff(null)
    setDiffLoading(true)
    setDiffUnavailable(false)
    setSidebarView('diff')
    try {
      const value = await invokeCoworkingWorkspaceRead(operationRoute, 'git.diff', {
        source: entry.area === 'staged' ? 'index' : 'working-tree',
        relativePath: entry.relativePath
      })
      if (request === diffRequestSequence.current) {
        setDiff(parseCoworkingGitDiffResult(value))
      }
    } catch (error) {
      if (request === diffRequestSequence.current && !isStaleRouteError(error)) {
        setDiffUnavailable(true)
        toast.error(
          translate(
            'auto.components.coworking.CoworkingGitPane.diffFailed',
            'Could not load this diff.'
          )
        )
      }
    } finally {
      if (request === diffRequestSequence.current) {
        setDiffLoading(false)
      }
    }
  }

  const selectHistory = async (entry: CoworkingGitHistoryEntry): Promise<void> => {
    const request = ++diffRequestSequence.current
    setMode('history')
    setSelectedHistory(entry)
    setSelectedStatus(null)
    setDiff(null)
    setDiffLoading(true)
    setDiffUnavailable(false)
    setSidebarView('diff')
    try {
      const value = await invokeCoworkingWorkspaceRead(operationRoute, 'git.diff', {
        source: 'commit',
        commitRef: entry.commitRef
      })
      if (request === diffRequestSequence.current) {
        setDiff(parseCoworkingGitDiffResult(value))
      }
    } catch (error) {
      if (request === diffRequestSequence.current && !isStaleRouteError(error)) {
        setDiffUnavailable(true)
        toast.error(
          translate(
            'auto.components.coworking.CoworkingGitPane.diffFailed',
            'Could not load this diff.'
          )
        )
      }
    } finally {
      if (request === diffRequestSequence.current) {
        setDiffLoading(false)
      }
    }
  }

  const toggleStage = async (entry: CoworkingGitStatusEntry): Promise<void> => {
    if (!canMutate || mutating) {
      return
    }
    setMutating(true)
    try {
      const method = entry.area === 'staged' ? 'git.unstage' : 'git.stage'
      const value = await invokeCoworkingWorkspaceMutation(operationRoute, method, {
        relativePaths: [entry.relativePath]
      })
      parseCoworkingMutationResult(value)
      diffRequestSequence.current += 1
      setSelectedStatus(null)
      setDiff(null)
      await refresh()
    } catch (error) {
      if (reportCoworkingGitMutationError(error)) {
        setMutationOutcomeUnknown(true)
      }
    } finally {
      setMutating(false)
    }
  }

  const commit = async (): Promise<void> => {
    const message = commitMessage.trim()
    if (!canMutate || mutating || !message) {
      return
    }
    if (new TextEncoder().encode(message).byteLength > 128 * 1_024) {
      toast.error(
        translate(
          'auto.components.coworking.CoworkingGitPane.commitTooLong',
          'The commit message is too long.'
        )
      )
      return
    }
    setMutating(true)
    try {
      const value = await invokeCoworkingWorkspaceMutation(operationRoute, 'git.commit', {
        message
      })
      parseCoworkingMutationResult(value)
      diffRequestSequence.current += 1
      setCommitMessage('')
      setSelectedStatus(null)
      setDiff(null)
      await refresh()
      toast.success(
        translate('auto.components.coworking.CoworkingGitPane.committed', 'Commit created.')
      )
    } catch (error) {
      if (reportCoworkingGitMutationError(error)) {
        setMutationOutcomeUnknown(true)
      }
    } finally {
      setMutating(false)
    }
  }

  const selectedKey = selectedStatus
    ? getCoworkingGitStatusEntryKey(selectedStatus)
    : (selectedHistory?.commitRef ?? null)
  return (
    <div className="flex h-full min-h-0 flex-col">
      {mutationOutcomeUnknown ? (
        <CoworkingMutationOutcomeNotice
          description={translate(
            'auto.components.coworking.CoworkingGitPane.outcomeUnknownPersistent',
            'The Git action may have succeeded. Refresh and inspect Git state before making another change.'
          )}
          onDismiss={() => setMutationOutcomeUnknown(false)}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        {sidebarView === 'list' ? (
          <CoworkingGitSidebar
            canControl={canMutate}
            commitMessage={commitMessage}
            history={history}
            loading={loading}
            mode={mode}
            mutating={mutating}
            selectedKey={selectedKey}
            status={status}
            unavailable={unavailable}
            onCommit={() => void commit()}
            onCommitMessageChange={setCommitMessage}
            onModeChange={(nextMode) => {
              diffRequestSequence.current += 1
              setMode(nextMode)
              setSidebarView('list')
              setSelectedStatus(null)
              setSelectedHistory(null)
              setDiff(null)
            }}
            onRefresh={() => void refresh()}
            onSelectChange={(entry) => void selectStatus(entry)}
            onSelectHistory={(entry) => void selectHistory(entry)}
            onToggleStage={(entry) => void toggleStage(entry)}
          />
        ) : null}
        {sidebarView === 'diff' ? (
          <CoworkingGitDiffPane
            diff={diff}
            historyEntry={selectedHistory}
            loading={diffLoading}
            onBack={() => setSidebarView('list')}
            statusEntry={selectedStatus}
            unavailable={diffUnavailable}
          />
        ) : null}
      </div>
    </div>
  )
}

function isStaleRouteError(error: unknown): boolean {
  return error instanceof CoworkingWorkspaceOperationError && error.code === 'stale_route'
}
