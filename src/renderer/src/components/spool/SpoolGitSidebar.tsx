import type React from 'react'
import { Check, GitCommitHorizontal, RefreshCw } from 'lucide-react'
import type {
  SpoolGitHistoryEntry,
  SpoolGitHistoryResult,
  SpoolGitStatusEntry,
  SpoolGitStatusResult
} from '../../../../shared/spool/spool-operation-contract'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { SpoolTruncatedPathLabel } from './SpoolTruncatedPathLabel'

export type SpoolGitSidebarMode = 'changes' | 'history'

function isSpoolGitSidebarMode(value: string): value is SpoolGitSidebarMode {
  return value === 'changes' || value === 'history'
}

export function SpoolGitSidebar({
  canControl,
  commitMessage,
  history,
  loading,
  mode,
  mutating,
  unavailable,
  selectedKey,
  status,
  onCommit,
  onCommitMessageChange,
  onModeChange,
  onRefresh,
  onSelectChange,
  onSelectHistory,
  onToggleStage
}: {
  canControl: boolean
  commitMessage: string
  history: SpoolGitHistoryResult | null
  loading: boolean
  mode: SpoolGitSidebarMode
  mutating: boolean
  unavailable: boolean
  selectedKey: string | null
  status: SpoolGitStatusResult | null
  onCommit: () => void
  onCommitMessageChange: (value: string) => void
  onModeChange: (mode: SpoolGitSidebarMode) => void
  onRefresh: () => void
  onSelectChange: (entry: SpoolGitStatusEntry) => void
  onSelectHistory: (entry: SpoolGitHistoryEntry) => void
  onToggleStage: (entry: SpoolGitStatusEntry) => void
}): React.JSX.Element {
  const stagedCount = status?.entries.filter((entry) => entry.area === 'staged').length ?? 0
  return (
    <aside className="flex min-h-0 w-full flex-1 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <header className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <GitCommitHorizontal aria-hidden="true" className="size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              {loading && !status
                ? translate(
                    'auto.components.spool.SpoolGitSidebar.loadingChanges',
                    'Loading changes…'
                  )
                : (status?.branch ??
                  translate('auto.components.spool.SpoolGitSidebar.detached', 'Detached HEAD'))}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {status ? formatUpstream(status) : ''}
            </p>
          </div>
          <Button type="button" size="xs" variant="ghost" disabled={loading} onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
            {translate('auto.components.spool.SpoolGitSidebar.refresh', 'Refresh')}
          </Button>
        </div>
      </header>
      <Tabs
        value={mode}
        onValueChange={(value) => isSpoolGitSidebarMode(value) && onModeChange(value)}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          className="h-9 w-full shrink-0 justify-start rounded-none border-b border-border px-2 py-0"
        >
          <TabsTrigger
            value="changes"
            className="h-8 flex-none rounded-none px-2 text-xs font-normal"
          >
            {translate('auto.components.spool.SpoolGitSidebar.changes', 'Changes')}
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="h-8 flex-none rounded-none px-2 text-xs font-normal"
          >
            {translate('auto.components.spool.SpoolGitSidebar.history', 'History')}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="changes"
          className="min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
        >
          <ChangesList
            canControl={canControl}
            entries={status?.entries ?? []}
            loading={loading}
            mutating={mutating}
            unavailable={unavailable}
            truncated={status?.truncated ?? false}
            selectedKey={selectedKey}
            onSelect={onSelectChange}
            onToggleStage={onToggleStage}
          />
        </TabsContent>
        <TabsContent
          value="history"
          className="min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
        >
          <HistoryList
            history={history}
            loading={loading}
            unavailable={unavailable}
            selectedKey={selectedKey}
            onSelect={onSelectHistory}
          />
        </TabsContent>
      </Tabs>
      {mode === 'changes' ? (
        <div className="shrink-0 space-y-2 border-t border-border p-2">
          <textarea
            value={commitMessage}
            disabled={!canControl || mutating}
            rows={3}
            maxLength={128 * 1_024}
            aria-label={translate(
              'auto.components.spool.SpoolGitSidebar.commitMessage',
              'Commit message'
            )}
            placeholder={translate(
              'auto.components.spool.SpoolGitSidebar.commitPlaceholder',
              'Commit message'
            )}
            onChange={(event) => onCommitMessageChange(event.currentTarget.value)}
            className="scrollbar-sleek w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-xs text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          />
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={!canControl || mutating || stagedCount === 0 || !commitMessage.trim()}
            onClick={onCommit}
          >
            <Check aria-hidden="true" />
            {translate('auto.components.spool.SpoolGitSidebar.commit', 'Commit staged changes')}
          </Button>
        </div>
      ) : null}
    </aside>
  )
}

function ChangesList({
  canControl,
  entries,
  loading,
  mutating,
  unavailable,
  truncated,
  selectedKey,
  onSelect,
  onToggleStage
}: {
  canControl: boolean
  entries: readonly SpoolGitStatusEntry[]
  loading: boolean
  mutating: boolean
  unavailable: boolean
  truncated: boolean
  selectedKey: string | null
  onSelect: (entry: SpoolGitStatusEntry) => void
  onToggleStage: (entry: SpoolGitStatusEntry) => void
}): React.JSX.Element {
  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-1">
      {loading ? (
        <SidebarMessage
          text={translate(
            'auto.components.spool.SpoolGitSidebar.loadingChanges',
            'Loading changes…'
          )}
        />
      ) : unavailable ? (
        <SidebarMessage
          text={translate(
            'auto.components.spool.SpoolGitSidebar.stateUnavailable',
            'Git state is unavailable.'
          )}
        />
      ) : entries.length === 0 ? (
        <SidebarMessage
          text={translate('auto.components.spool.SpoolGitSidebar.clean', 'No worktree changes.')}
        />
      ) : (
        entries.map((entry) => {
          const key = getSpoolGitStatusEntryKey(entry)
          return (
            <div
              key={key}
              data-current={selectedKey === key ? 'true' : undefined}
              className={cn(
                'group flex items-center rounded-md text-[13px]',
                selectedKey === key
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-accent'
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
                onClick={() => onSelect(entry)}
              >
                <span
                  className={cn(
                    'w-4 shrink-0 text-center font-mono text-[11px]',
                    getGitStatusColor(entry)
                  )}
                >
                  {getGitStatusLabel(entry)}
                </span>
                <SpoolTruncatedPathLabel path={entry.relativePath} className="flex-1" />
              </button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="mr-1"
                disabled={!canControl || mutating}
                onClick={() => onToggleStage(entry)}
              >
                {entry.area === 'staged'
                  ? translate('auto.components.spool.SpoolGitSidebar.unstage', 'Unstage')
                  : translate('auto.components.spool.SpoolGitSidebar.stage', 'Stage')}
              </Button>
            </div>
          )
        })
      )}
      {!loading && !unavailable && truncated ? (
        <p className="px-2 py-2 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.spool.SpoolGitSidebar.changesLimited',
            'Only part of this status is shown.'
          )}
        </p>
      ) : null}
    </div>
  )
}

function HistoryList({
  history,
  loading,
  unavailable,
  selectedKey,
  onSelect
}: {
  history: SpoolGitHistoryResult | null
  loading: boolean
  unavailable: boolean
  selectedKey: string | null
  onSelect: (entry: SpoolGitHistoryEntry) => void
}): React.JSX.Element {
  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-1">
      {loading ? (
        <SidebarMessage
          text={translate(
            'auto.components.spool.SpoolGitSidebar.loadingHistory',
            'Loading history…'
          )}
        />
      ) : unavailable ? (
        <SidebarMessage
          text={translate(
            'auto.components.spool.SpoolGitSidebar.stateUnavailable',
            'Git state is unavailable.'
          )}
        />
      ) : !history || history.entries.length === 0 ? (
        <SidebarMessage
          text={translate('auto.components.spool.SpoolGitSidebar.noHistory', 'No commits found.')}
        />
      ) : (
        history.entries.map((entry) => (
          <button
            key={entry.commitRef}
            type="button"
            data-current={selectedKey === entry.commitRef ? 'true' : undefined}
            onClick={() => onSelect(entry)}
            className={cn(
              'block w-full rounded-md px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring',
              selectedKey === entry.commitRef
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'hover:bg-sidebar-accent'
            )}
          >
            <span className="block truncate text-xs font-medium">
              {entry.subject || entry.commitRef}
            </span>
            <span className="mt-0.5 flex gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">{entry.commitRef.slice(0, 8)}</span>
              <span className="min-w-0 truncate">{entry.author}</span>
            </span>
          </button>
        ))
      )}
      {history?.hasMore ? (
        <p className="px-2 py-2 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.spool.SpoolGitSidebar.historyLimited',
            'Showing the latest commits.'
          )}
        </p>
      ) : null}
    </div>
  )
}

function SidebarMessage({ text }: { text: string }): React.JSX.Element {
  return <p className="px-2 py-3 text-xs text-muted-foreground">{text}</p>
}

export function getSpoolGitStatusEntryKey(entry: SpoolGitStatusEntry): string {
  return `${entry.area}:${entry.relativePath}`
}

function getGitStatusLabel(entry: SpoolGitStatusEntry): string {
  if (entry.conflicted) {
    return '!'
  }
  if (entry.status === 'untracked') {
    return '?'
  }
  if (entry.status === 'renamed') {
    return 'R'
  }
  if (entry.status === 'deleted') {
    return 'D'
  }
  if (entry.status === 'added') {
    return 'A'
  }
  if (entry.status === 'copied') {
    return 'C'
  }
  return 'M'
}

function getGitStatusColor(entry: SpoolGitStatusEntry): string {
  if (entry.conflicted) {
    return 'text-destructive'
  }
  switch (entry.status) {
    case 'added':
      return 'text-[var(--git-decoration-added)]'
    case 'modified':
      return 'text-[var(--git-decoration-modified)]'
    case 'deleted':
      return 'text-[var(--git-decoration-deleted)]'
    case 'renamed':
      return 'text-[var(--git-decoration-renamed)]'
    case 'untracked':
      return 'text-[var(--git-decoration-untracked)]'
    case 'copied':
      return 'text-[var(--git-decoration-copied)]'
  }
}

function formatUpstream(status: SpoolGitStatusResult | null): string {
  if (!status?.upstream) {
    return translate('auto.components.spool.SpoolGitSidebar.noUpstream', 'No upstream')
  }
  return translate(
    'auto.components.spool.SpoolGitSidebar.upstream',
    '{{value0}} · ↑{{value1}} ↓{{value2}}',
    { value0: status.upstream.name, value1: status.upstream.ahead, value2: status.upstream.behind }
  )
}
