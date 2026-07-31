import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { LEGEND_LIST_SCROLL_AREA_PROPS } from '~renderer/components/sidebar/list-scroll-area'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import type { CoworkingGitStatusEntry } from '~shared/coworking/operation-contract'

import { SourceControlSectionHeader } from '../workspace-panel/source-control/section-header'
import { CoworkingTruncatedPathLabel } from './truncated-path-label'

// Why: both areas share one scroller, so they are rows of a single virtualized
// list — separate lists would each need their own scrollbar.
type CoworkingGitChangesRow =
  | {
      kind: 'section'
      key: string
      area: CoworkingGitStatusEntry['area']
      count: number
      conflictCount: number
    }
  | { kind: 'entry'; key: string; entry: CoworkingGitStatusEntry }

// Why: a change row is a single 13px line; LegendList measures real heights
// after the first paint and only needs this hint for the initial window.
const COWORKING_CHANGE_ROW_ESTIMATE_PX = 24

function getCoworkingGitChangesRowKey(row: CoworkingGitChangesRow): string {
  return row.key
}

function getCoworkingGitChangesRowType(row: CoworkingGitChangesRow): string {
  return row.kind
}

function buildCoworkingGitChangesRows(
  entries: readonly CoworkingGitStatusEntry[],
  collapsedAreas: ReadonlySet<CoworkingGitStatusEntry['area']>
): { rows: CoworkingGitChangesRow[]; stickyHeaderIndices: number[] } {
  const rows: CoworkingGitChangesRow[] = []
  const stickyHeaderIndices: number[] = []
  for (const area of ['staged', 'unstaged'] as const) {
    const areaEntries = entries.filter((entry) =>
      area === 'staged' ? entry.area === 'staged' : entry.area !== 'staged'
    )
    if (areaEntries.length === 0) {
      continue
    }
    stickyHeaderIndices.push(rows.length)
    rows.push({
      kind: 'section',
      key: `section:${area}`,
      area,
      count: areaEntries.length,
      conflictCount: areaEntries.filter((entry) => entry.conflicted).length
    })
    if (collapsedAreas.has(area)) {
      continue
    }
    for (const entry of areaEntries) {
      rows.push({ kind: 'entry', key: getCoworkingGitStatusEntryKey(entry), entry })
    }
  }
  return { rows, stickyHeaderIndices }
}

function getCoworkingChangesAreaLabel(area: CoworkingGitStatusEntry['area']): string {
  return area === 'staged'
    ? translate('auto.components.right.sidebar.SourceControl.48a003c1b1', 'Staged Changes')
    : translate('auto.components.right.sidebar.SourceControl.d4ef4bafc5', 'Changes')
}

export function CoworkingGitChangesList({
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
  entries: readonly CoworkingGitStatusEntry[]
  loading: boolean
  mutating: boolean
  unavailable: boolean
  truncated: boolean
  selectedKey: string | null
  onSelect: (entry: CoworkingGitStatusEntry) => void
  onToggleStage: (entry: CoworkingGitStatusEntry) => void
}): React.JSX.Element {
  const [collapsedAreas, setCollapsedAreas] = useState<
    ReadonlySet<CoworkingGitStatusEntry['area']>
  >(() => new Set())
  const model = useMemo(
    () => buildCoworkingGitChangesRows(entries, collapsedAreas),
    [collapsedAreas, entries]
  )
  const toggleArea = (area: CoworkingGitStatusEntry['area']): void => {
    setCollapsedAreas((current) => {
      const next = new Set(current)
      if (next.has(area)) {
        next.delete(area)
      } else {
        next.add(area)
      }
      return next
    })
  }
  const truncatedNotice =
    !loading && !unavailable && truncated ? (
      <p className="text-muted-foreground px-2 py-2 text-[11px]">
        {translate(
          'auto.components.coworking.CoworkingGitSidebar.changesLimited',
          'Only part of this status is shown.'
        )}
      </p>
    ) : null

  if (loading || unavailable || entries.length === 0) {
    return (
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        <ChangesMessage
          text={
            loading
              ? translate(
                  'auto.components.coworking.CoworkingGitSidebar.loadingChanges',
                  'Loading changes…'
                )
              : unavailable
                ? translate(
                    'auto.components.coworking.CoworkingGitSidebar.stateUnavailable',
                    'Git state is unavailable.'
                  )
                : translate(
                    'auto.components.coworking.CoworkingGitSidebar.clean',
                    'No worktree changes.'
                  )
          }
        />
        {truncatedNotice}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1">
      <LegendList<CoworkingGitChangesRow>
        {...LEGEND_LIST_SCROLL_AREA_PROPS}
        data={model.rows}
        keyExtractor={getCoworkingGitChangesRowKey}
        getItemType={getCoworkingGitChangesRowType}
        estimatedItemSize={COWORKING_CHANGE_ROW_ESTIMATE_PX}
        stickyHeaderIndices={model.stickyHeaderIndices}
        ListFooterComponent={truncatedNotice}
        renderItem={({ item }: LegendListRenderItemProps<CoworkingGitChangesRow>) =>
          item.kind === 'section' ? (
            <SourceControlSectionHeader
              label={getCoworkingChangesAreaLabel(item.area)}
              count={item.count}
              conflictCount={item.conflictCount}
              isCollapsed={collapsedAreas.has(item.area)}
              onToggle={() => toggleArea(item.area)}
            />
          ) : (
            <CoworkingChangeRow
              entry={item.entry}
              canControl={canControl}
              mutating={mutating}
              selected={selectedKey === item.key}
              onSelect={() => onSelect(item.entry)}
              onToggleStage={() => onToggleStage(item.entry)}
            />
          )
        }
      />
    </div>
  )
}

function CoworkingChangeRow({
  entry,
  canControl,
  mutating,
  selected,
  onSelect,
  onToggleStage
}: {
  entry: CoworkingGitStatusEntry
  canControl: boolean
  mutating: boolean
  selected: boolean
  onSelect: () => void
  onToggleStage: () => void
}): React.JSX.Element {
  return (
    <div
      data-current={selected ? 'true' : undefined}
      className={cn(
        'group flex items-center text-[13px]',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        type="button"
        className="flex h-auto min-w-0 flex-1 justify-start gap-2 border-0 py-1 text-left font-normal whitespace-normal"
        onClick={onSelect}
      >
        <span
          className={cn('w-4 shrink-0 text-center font-mono text-[11px]', getGitStatusColor(entry))}
        >
          {getGitStatusLabel(entry)}
        </span>
        <CoworkingTruncatedPathLabel path={entry.relativePath} className="flex-1" />
      </Button>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="mr-1"
        disabled={!canControl || mutating}
        onClick={onToggleStage}
      >
        {entry.area === 'staged'
          ? translate('auto.components.coworking.CoworkingGitSidebar.unstage', 'Unstage')
          : translate('auto.components.coworking.CoworkingGitSidebar.stage', 'Stage')}
      </Button>
    </div>
  )
}

function ChangesMessage({ text }: { text: string }): React.JSX.Element {
  return <p className="text-muted-foreground px-2 py-3 text-xs">{text}</p>
}

export function getCoworkingGitStatusEntryKey(entry: CoworkingGitStatusEntry): string {
  return `${entry.area}:${entry.relativePath}`
}

function getGitStatusLabel(entry: CoworkingGitStatusEntry): string {
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

function getGitStatusColor(entry: CoworkingGitStatusEntry): string {
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
