import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  SpoolGitDiffResult,
  SpoolGitHistoryEntry,
  SpoolGitHistoryResult,
  SpoolGitStatusEntry,
  SpoolGitStatusResult
} from '../../../../shared/spool/spool-operation-contract'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { selectSpoolCanControl } from '@/store/slices/spool-sharing-selectors'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import { SpoolGitDiffPane } from './SpoolGitDiffPane'
import {
  getSpoolGitStatusEntryKey,
  SpoolGitSidebar,
  type SpoolGitSidebarMode
} from './SpoolGitSidebar'
import {
  parseSpoolGitDiffResult,
  parseSpoolGitHistoryResult,
  parseSpoolGitStatusResult,
  parseSpoolMutationResult
} from './spool-owner-result-validation'
import {
  invokeSpoolWorkspaceMutation,
  invokeSpoolWorkspaceRead,
  SpoolWorkspaceOperationError
} from './spool-workspace-operation'
import { reportSpoolGitMutationError } from './spool-workspace-mutation-feedback'
import { SpoolMutationOutcomeNotice } from './SpoolMutationOutcomeNotice'
import { useSpoolWorktreeOperationRoute } from './spool-worktree-route'

export function SpoolGitPane({ route }: { route: SpoolWorkspaceRoute }): React.JSX.Element {
  const operationRoute = useSpoolWorktreeOperationRoute(route)
  const canControl = useAppStore((state) => selectSpoolCanControl(state, operationRoute))
  const [status, setStatus] = useState<SpoolGitStatusResult | null>(null)
  const [history, setHistory] = useState<SpoolGitHistoryResult | null>(null)
  const [mode, setMode] = useState<SpoolGitSidebarMode>('changes')
  const [selectedStatus, setSelectedStatus] = useState<SpoolGitStatusEntry | null>(null)
  const [selectedHistory, setSelectedHistory] = useState<SpoolGitHistoryEntry | null>(null)
  const [diff, setDiff] = useState<SpoolGitDiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffUnavailable, setDiffUnavailable] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [mutationOutcomeUnknown, setMutationOutcomeUnknown] = useState(false)
  const canMutate = canControl && !mutationOutcomeUnknown
  const requestSequence = useRef(0)
  const diffRequestSequence = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++requestSequence.current
    setLoading(true)
    setUnavailable(false)
    try {
      const [statusValue, historyValue] = await Promise.all([
        invokeSpoolWorkspaceRead(operationRoute, 'git.status', {}),
        invokeSpoolWorkspaceRead(operationRoute, 'git.history', { limit: 100 })
      ])
      const nextStatus = parseSpoolGitStatusResult(statusValue)
      const nextHistory = parseSpoolGitHistoryResult(historyValue)
      if (request === requestSequence.current) {
        setStatus(nextStatus)
        setHistory(nextHistory)
      }
    } catch (error) {
      if (request === requestSequence.current && !isStaleRouteError(error)) {
        setUnavailable(true)
        toast.error(
          translate('auto.components.spool.SpoolGitPane.refreshFailed', 'Could not load Git state.')
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

  const selectStatus = async (entry: SpoolGitStatusEntry): Promise<void> => {
    const request = ++diffRequestSequence.current
    setMode('changes')
    setSelectedStatus(entry)
    setSelectedHistory(null)
    setDiff(null)
    setDiffLoading(true)
    setDiffUnavailable(false)
    try {
      const value = await invokeSpoolWorkspaceRead(operationRoute, 'git.diff', {
        source: entry.area === 'staged' ? 'index' : 'working-tree',
        relativePath: entry.relativePath
      })
      if (request === diffRequestSequence.current) {
        setDiff(parseSpoolGitDiffResult(value))
      }
    } catch (error) {
      if (request === diffRequestSequence.current && !isStaleRouteError(error)) {
        setDiffUnavailable(true)
        toast.error(
          translate('auto.components.spool.SpoolGitPane.diffFailed', 'Could not load this diff.')
        )
      }
    } finally {
      if (request === diffRequestSequence.current) {
        setDiffLoading(false)
      }
    }
  }

  const selectHistory = async (entry: SpoolGitHistoryEntry): Promise<void> => {
    const request = ++diffRequestSequence.current
    setMode('history')
    setSelectedHistory(entry)
    setSelectedStatus(null)
    setDiff(null)
    setDiffLoading(true)
    setDiffUnavailable(false)
    try {
      const value = await invokeSpoolWorkspaceRead(operationRoute, 'git.diff', {
        source: 'commit',
        commitRef: entry.commitRef
      })
      if (request === diffRequestSequence.current) {
        setDiff(parseSpoolGitDiffResult(value))
      }
    } catch (error) {
      if (request === diffRequestSequence.current && !isStaleRouteError(error)) {
        setDiffUnavailable(true)
        toast.error(
          translate('auto.components.spool.SpoolGitPane.diffFailed', 'Could not load this diff.')
        )
      }
    } finally {
      if (request === diffRequestSequence.current) {
        setDiffLoading(false)
      }
    }
  }

  const toggleStage = async (entry: SpoolGitStatusEntry): Promise<void> => {
    if (!canMutate || mutating) {
      return
    }
    setMutating(true)
    try {
      const method = entry.area === 'staged' ? 'git.unstage' : 'git.stage'
      const value = await invokeSpoolWorkspaceMutation(operationRoute, method, {
        relativePaths: [entry.relativePath]
      })
      parseSpoolMutationResult(value)
      diffRequestSequence.current += 1
      setSelectedStatus(null)
      setDiff(null)
      await refresh()
    } catch (error) {
      if (reportSpoolGitMutationError(error)) {
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
          'auto.components.spool.SpoolGitPane.commitTooLong',
          'The commit message is too long.'
        )
      )
      return
    }
    setMutating(true)
    try {
      const value = await invokeSpoolWorkspaceMutation(operationRoute, 'git.commit', { message })
      parseSpoolMutationResult(value)
      diffRequestSequence.current += 1
      setCommitMessage('')
      setSelectedStatus(null)
      setDiff(null)
      await refresh()
      toast.success(translate('auto.components.spool.SpoolGitPane.committed', 'Commit created.'))
    } catch (error) {
      if (reportSpoolGitMutationError(error)) {
        setMutationOutcomeUnknown(true)
      }
    } finally {
      setMutating(false)
    }
  }

  const selectedKey = selectedStatus
    ? getSpoolGitStatusEntryKey(selectedStatus)
    : (selectedHistory?.commitRef ?? null)
  return (
    <div className="flex h-full min-h-0 flex-col">
      {mutationOutcomeUnknown ? (
        <SpoolMutationOutcomeNotice
          description={translate(
            'auto.components.spool.SpoolGitPane.outcomeUnknownPersistent',
            'The Git action may have succeeded. Refresh and inspect Git state before making another change.'
          )}
          onDismiss={() => setMutationOutcomeUnknown(false)}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        <SpoolGitSidebar
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
            setSelectedStatus(null)
            setSelectedHistory(null)
            setDiff(null)
          }}
          onRefresh={() => void refresh()}
          onSelectChange={(entry) => void selectStatus(entry)}
          onSelectHistory={(entry) => void selectHistory(entry)}
          onToggleStage={(entry) => void toggleStage(entry)}
        />
        <SpoolGitDiffPane
          diff={diff}
          historyEntry={selectedHistory}
          loading={diffLoading}
          statusEntry={selectedStatus}
          unavailable={diffUnavailable}
        />
      </div>
    </div>
  )
}

function isStaleRouteError(error: unknown): boolean {
  return error instanceof SpoolWorkspaceOperationError && error.code === 'stale_route'
}
