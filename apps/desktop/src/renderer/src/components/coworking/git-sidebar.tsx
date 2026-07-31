import {
  Check,
  GitCommit as GitCommitHorizontal,
  ArrowClockwise as RefreshCw
} from '@phosphor-icons/react'
import type React from 'react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type {
  CoworkingGitHistoryEntry,
  CoworkingGitHistoryResult,
  CoworkingGitStatusEntry,
  CoworkingGitStatusResult
} from '../../../../shared/coworking/operation-contract'
import { CoworkingGitChangesList } from './git-changes-list'

export type CoworkingGitSidebarMode = 'changes' | 'history'

function isCoworkingGitSidebarMode(value: string): value is CoworkingGitSidebarMode {
  return value === 'changes' || value === 'history'
}

export function CoworkingGitSidebar({
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
  history: CoworkingGitHistoryResult | null
  loading: boolean
  mode: CoworkingGitSidebarMode
  mutating: boolean
  unavailable: boolean
  selectedKey: string | null
  status: CoworkingGitStatusResult | null
  onCommit: () => void
  onCommitMessageChange: (value: string) => void
  onModeChange: (mode: CoworkingGitSidebarMode) => void
  onRefresh: () => void
  onSelectChange: (entry: CoworkingGitStatusEntry) => void
  onSelectHistory: (entry: CoworkingGitHistoryEntry) => void
  onToggleStage: (entry: CoworkingGitStatusEntry) => void
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
                    'auto.components.coworking.CoworkingGitSidebar.loadingChanges',
                    'Loading changes…'
                  )
                : (status?.branch ??
                  translate(
                    'auto.components.coworking.CoworkingGitSidebar.detached',
                    'Detached HEAD'
                  ))}
            </p>
            <p className="text-muted-foreground truncate text-[11px]">
              {status ? formatUpstream(status) : ''}
            </p>
          </div>
          <Button type="button" size="xs" variant="ghost" disabled={loading} onClick={onRefresh}>
            <RefreshCw aria-hidden="true" />
            {translate('auto.components.coworking.CoworkingGitSidebar.refresh', 'Refresh')}
          </Button>
        </div>
      </header>
      <Tabs
        value={mode}
        onValueChange={(value) => isCoworkingGitSidebarMode(value) && onModeChange(value)}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          className="border-border h-9 w-full shrink-0 justify-start border-b px-2 py-0"
        >
          <TabsTrigger value="changes" className="h-8 flex-none px-2 text-xs font-normal">
            {translate('auto.components.coworking.CoworkingGitSidebar.changes', 'Changes')}
          </TabsTrigger>
          <TabsTrigger value="history" className="h-8 flex-none px-2 text-xs font-normal">
            {translate('auto.components.coworking.CoworkingGitSidebar.history', 'History')}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="changes"
          className="min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
        >
          <CoworkingGitChangesList
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
              'auto.components.coworking.CoworkingGitSidebar.commitMessage',
              'Commit message'
            )}
            placeholder={translate(
              'auto.components.coworking.CoworkingGitSidebar.commitPlaceholder',
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
            {translate(
              'auto.components.coworking.CoworkingGitSidebar.commit',
              'Commit staged changes'
            )}
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
  history: CoworkingGitHistoryResult | null
  loading: boolean
  unavailable: boolean
  selectedKey: string | null
  onSelect: (entry: CoworkingGitHistoryEntry) => void
}): React.JSX.Element {
  return (
    <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto p-1">
      {loading ? (
        <SidebarMessage
          text={translate(
            'auto.components.coworking.CoworkingGitSidebar.loadingHistory',
            'Loading history…'
          )}
        />
      ) : unavailable ? (
        <SidebarMessage
          text={translate(
            'auto.components.coworking.CoworkingGitSidebar.stateUnavailable',
            'Git state is unavailable.'
          )}
        />
      ) : !history || history.entries.length === 0 ? (
        <SidebarMessage
          text={translate(
            'auto.components.coworking.CoworkingGitSidebar.noHistory',
            'No commits found.'
          )}
        />
      ) : (
        history.entries.map((entry) => (
          <Button
            variant="ghost"
            size="default"
            key={entry.commitRef}
            type="button"
            data-current={selectedKey === entry.commitRef ? 'true' : undefined}
            onClick={() => onSelect(entry)}
            className={cn(
              'border-0 justify-start gap-0 whitespace-normal font-normal block w-full px-2 text-left ',
              selectedKey === entry.commitRef ? 'bg-accent text-accent-foreground' : ''
            )}
          >
            <span className="block truncate text-xs font-medium">
              {entry.subject || entry.commitRef}
            </span>
            <span className="text-muted-foreground mt-0.5 flex gap-2 text-[11px]">
              <span className="font-mono">{entry.commitRef.slice(0, 8)}</span>
              <span className="min-w-0 truncate">{entry.author}</span>
            </span>
          </Button>
        ))
      )}
      {history?.hasMore ? (
        <p className="text-muted-foreground px-2 py-2 text-[11px]">
          {translate(
            'auto.components.coworking.CoworkingGitSidebar.historyLimited',
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

function formatUpstream(status: CoworkingGitStatusResult | null): string {
  if (!status?.upstream) {
    return translate('auto.components.coworking.CoworkingGitSidebar.noUpstream', 'No upstream')
  }
  return translate(
    'auto.components.coworking.CoworkingGitSidebar.upstream',
    '{{value0}} · ↑{{value1}} ↓{{value2}}',
    { value0: status.upstream.name, value1: status.upstream.ahead, value2: status.upstream.behind }
  )
}
