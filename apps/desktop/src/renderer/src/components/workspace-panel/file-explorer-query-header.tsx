import { cn } from '@/lib/class-names'

import type { FileExplorerInteractions } from './file-explorer-interactions'
import type { FileExplorerModel } from './file-explorer-model'
import { FileExplorerNameFilter } from './file-explorer-name-filter'
import { FileExplorerQueryStrip } from './file-explorer-query-strip'
import { FileExplorerToolbar } from './file-explorer-toolbar'
import { SearchFilters } from './search-filters'
import { SearchQueryRow } from './search-query-row'

export function FileExplorerQueryHeader({
  model,
  interactions
}: {
  model: FileExplorerModel
  interactions: FileExplorerInteractions
}): React.JSX.Element {
  const { view, owner, tree, display, actions } = model
  const canCollapseAll = view.isFilesViewActive && !view.hasNameFilter && tree.expanded.size > 0

  return (
    <>
      <FileExplorerToolbar
        repoName={display.repoName}
        worktreePath={owner.worktreePath!}
        connectionId={owner.activeRepo?.connectionId ?? null}
        runtimeEnvironmentId={owner.activeRuntimeEnvironmentId}
        refresh={display.manualRefresh}
        canRefresh={view.isFilesViewActive}
        canCollapseAll={canCollapseAll}
        onCollapseAll={interactions.actions.handleCollapseAll}
        showGitIgnoredFilesToggle={display.activeRepoSupportsGit}
        showGitIgnoredFiles={display.showGitIgnoredFiles}
        onToggleGitIgnoredFiles={actions.toggleGitIgnoredFiles}
        showDotfiles={display.showDotfiles}
        onToggleDotfiles={interactions.actions.handleToggleDotfiles}
      />
      <FileExplorerQueryStrip view={view.explorerView} onSelectView={view.handleSelectExplorerView}>
        {/* Why: cross-fading preserves query focus and virtualized pane state. */}
        <div className="relative min-h-7">
          <div
            className={cn(
              view.explorerView !== 'files' &&
                'pointer-events-none invisible absolute inset-x-0 top-0'
            )}
          >
            <FileExplorerNameFilter
              query={view.nameFilterQuery}
              loading={view.nameFilterFiles.loading}
              onQueryChange={view.setNameFilterQuery}
              onClear={view.handleClearNameFilter}
            />
          </div>
          <div
            className={cn(
              view.explorerView !== 'search' &&
                'pointer-events-none invisible absolute inset-x-0 top-0'
            )}
          >
            <SearchQueryRow {...view.searchPanel.queryRowProps} />
          </div>
        </div>
      </FileExplorerQueryStrip>
      <div
        className={cn(
          'border-b border-border px-2 pb-1.5',
          view.explorerView !== 'search' &&
            'pointer-events-none invisible h-0 overflow-hidden border-b-0 p-0'
        )}
      >
        <SearchFilters {...view.searchPanel.filtersProps} />
      </div>
    </>
  )
}
