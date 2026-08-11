import type React from 'react'
import { CommandEmpty } from '~renderer/components/ui/command'
import { translate } from '~renderer/i18n/i18n'

import { PaletteState } from '../palette-parts'
import type { PaletteItem, PaletteListEntry } from '../types'
import type { PaletteHostOptionsResult } from '../use-palette-host-options'
import type { PaletteStoreState } from '../use-palette-store-state'
import type { WorktreeSearchResult } from '../use-worktree-search'
import { BrowserPageRow, SimulatorTabRow, WorkspaceTabRow } from './open-tab-rows'
import { ProjectTargetRow } from './project-target-row'
import { SettingsOrQuickActionRow } from './settings-action-row'
import { CreateWorktreeRow, HintTextRow, SectionHeaderRow } from './simple-rows'
import { WorktreeRow } from './worktree-row'

type PaletteResultsListProps = Pick<
  PaletteStoreState,
  | 'tabsByWorktree'
  | 'browserTabsByWorktree'
  | 'ptyIdsByTabId'
  | 'runtimePaneTitlesByTabId'
  | 'activeWorktreeId'
> &
  Pick<PaletteHostOptionsResult, 'repoMap' | 'hostOptions'> &
  Pick<WorktreeSearchResult, 'liveAgentStatusByWorktreeId' | 'worktreeMap' | 'isLoading'> & {
    listEntries: PaletteListEntry[]
    resultCount: number
    showCreateAction: boolean
    createWorktreeName: string
    emptyState: { title: string; subtitle: string }
    onSelectItem: (item: PaletteItem) => void
    onCreateWorktree: () => void
  }

// Why: the palette's loading/empty/populated states and the per-entry-type row
// rendering are one rendering concern — keeping it here means the panel
// component only wires data in and never branches on entry.type itself.
export function PaletteResultsList({
  isLoading,
  resultCount,
  showCreateAction,
  listEntries,
  createWorktreeName,
  emptyState,
  repoMap,
  hostOptions,
  worktreeMap,
  tabsByWorktree,
  browserTabsByWorktree,
  ptyIdsByTabId,
  runtimePaneTitlesByTabId,
  liveAgentStatusByWorktreeId,
  activeWorktreeId,
  onSelectItem,
  onCreateWorktree
}: PaletteResultsListProps): React.JSX.Element {
  if (isLoading && resultCount === 0 && !showCreateAction) {
    return (
      <PaletteState
        title={translate('auto.components.WorktreeJumpPalette.ff908adfe9', 'Loading jump targets')}
        subtitle={translate(
          'auto.components.WorktreeJumpPalette.684e8d7bc2',
          'Gathering your recent worktrees and open tabs.'
        )}
      />
    )
  }

  if (resultCount === 0 && !showCreateAction) {
    return (
      <CommandEmpty className="py-0">
        <PaletteState title={emptyState.title} subtitle={emptyState.subtitle} />
      </CommandEmpty>
    )
  }

  return (
    <>
      {listEntries.map((entry) => {
        if (entry.type === 'section-header') {
          return <SectionHeaderRow key={entry.id} entry={entry} />
        }

        if (entry.type === 'hint') {
          return <HintTextRow key={entry.id} entry={entry} />
        }

        if (entry.type === 'create-worktree') {
          return (
            <CreateWorktreeRow
              key={entry.id}
              createWorktreeName={createWorktreeName}
              onSelect={onCreateWorktree}
            />
          )
        }

        if (entry.type === 'worktree') {
          return (
            <WorktreeRow
              key={entry.id}
              entry={entry}
              repoMap={repoMap}
              hostOptions={hostOptions}
              tabsByWorktree={tabsByWorktree}
              browserTabsByWorktree={browserTabsByWorktree}
              ptyIdsByTabId={ptyIdsByTabId}
              runtimePaneTitlesByTabId={runtimePaneTitlesByTabId}
              liveAgentStatusByWorktreeId={liveAgentStatusByWorktreeId}
              activeWorktreeId={activeWorktreeId}
              onSelect={onSelectItem}
            />
          )
        }

        if (entry.type === 'project-target') {
          return (
            <ProjectTargetRow
              key={entry.id}
              entry={entry}
              hostOptions={hostOptions}
              onSelect={onSelectItem}
            />
          )
        }

        if (entry.type === 'settings' || entry.type === 'quick-action') {
          return <SettingsOrQuickActionRow key={entry.id} entry={entry} onSelect={onSelectItem} />
        }

        if (entry.type === 'workspace-tab') {
          return (
            <WorkspaceTabRow
              key={entry.id}
              entry={entry}
              worktreeMap={worktreeMap}
              repoMap={repoMap}
              hostOptions={hostOptions}
              onSelect={onSelectItem}
            />
          )
        }

        if (entry.type === 'simulator-tab') {
          return (
            <SimulatorTabRow
              key={entry.id}
              entry={entry}
              worktreeMap={worktreeMap}
              repoMap={repoMap}
              hostOptions={hostOptions}
              onSelect={onSelectItem}
            />
          )
        }

        return (
          <BrowserPageRow
            key={entry.id}
            entry={entry}
            worktreeMap={worktreeMap}
            repoMap={repoMap}
            hostOptions={hostOptions}
            onSelect={onSelectItem}
          />
        )
      })}
    </>
  )
}
