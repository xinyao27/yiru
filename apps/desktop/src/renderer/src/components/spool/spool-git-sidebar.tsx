import { Check, GitCommit as GitCommitHorizontal } from '@phosphor-icons/react'
import type React from 'react'

import { ArrowClockwise as RefreshCw } from '@/components/regular-icons'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type {
  SpoolGitHistoryEntry,
  SpoolGitHistoryResult,
  SpoolGitStatusEntry,
  SpoolGitStatusResult
} from '../../../../shared/spool/spool-operation-contract'
import { SpoolGitChangesList } from './spool-git-changes-list'

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
    <aside className="bg-sidebar text-sidebar-foreground flex min-h-0 w-full flex-1 shrink-0 flex-col">
      <header className="border-border border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <GitCommitHorizontal aria-hidden="true" className="text-muted-foreground size-4" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-xs font-medium">
              {loading && !status
                ? translate(
                    'auto.components.spool.SpoolGitSidebar.loadingChanges',
                    'Loading changes…'
                  )
                : (status?.branch ??
                  translate('auto.components.spool.SpoolGitSidebar.detached', 'Detached HEAD'))}
            </p>
            <p className="text-muted-foreground truncate text-[11px]">
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
          className="border-border h-9 w-full shrink-0 justify-start rounded-none border-b px-2 py-0"
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
          <SpoolGitChangesList
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
        <div className="border-border shrink-0 space-y-2 border-t p-2">
          <Textarea
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
            className="min-h-0 resize-none px-2 py-1.5 text-xs"
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
            <span className="text-muted-foreground mt-0.5 flex gap-2 text-[11px]">
              <span className="font-mono">{entry.commitRef.slice(0, 8)}</span>
              <span className="min-w-0 truncate">{entry.author}</span>
            </span>
          </button>
        ))
      )}
      {history?.hasMore ? (
        <p className="text-muted-foreground px-2 py-2 text-[11px]">
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
  return <p className="text-muted-foreground px-2 py-3 text-xs">{text}</p>
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
