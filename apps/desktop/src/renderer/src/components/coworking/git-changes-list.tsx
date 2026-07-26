import type React from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { CoworkingGitStatusEntry } from '../../../../shared/coworking/operation-contract'
import { SourceControlSectionHeader } from '../workspace-panel/source-control/section-header'
import { SourceControlVirtualFileList } from '../workspace-panel/source-control/virtual-file-list'
import { CoworkingTruncatedPathLabel } from './truncated-path-label'

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
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [collapsedAreas, setCollapsedAreas] = useState<
    ReadonlySet<CoworkingGitStatusEntry['area']>
  >(() => new Set())
  const staged = entries.filter((entry) => entry.area === 'staged')
  const unstaged = entries.filter((entry) => entry.area !== 'staged')
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
  return (
    <div ref={setScrollElement} className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
      {loading ? (
        <ChangesMessage
          text={translate(
            'auto.components.coworking.CoworkingGitSidebar.loadingChanges',
            'Loading changes…'
          )}
        />
      ) : unavailable ? (
        <ChangesMessage
          text={translate(
            'auto.components.coworking.CoworkingGitSidebar.stateUnavailable',
            'Git state is unavailable.'
          )}
        />
      ) : entries.length === 0 ? (
        <ChangesMessage
          text={translate(
            'auto.components.coworking.CoworkingGitSidebar.clean',
            'No worktree changes.'
          )}
        />
      ) : (
        <>
          <CoworkingChangesSection
            area="staged"
            canControl={canControl}
            collapsed={collapsedAreas.has('staged')}
            entries={staged}
            mutating={mutating}
            scrollElement={scrollElement}
            selectedKey={selectedKey}
            onSelect={onSelect}
            onToggle={() => toggleArea('staged')}
            onToggleStage={onToggleStage}
          />
          <CoworkingChangesSection
            area="unstaged"
            canControl={canControl}
            collapsed={collapsedAreas.has('unstaged')}
            entries={unstaged}
            mutating={mutating}
            scrollElement={scrollElement}
            selectedKey={selectedKey}
            onSelect={onSelect}
            onToggle={() => toggleArea('unstaged')}
            onToggleStage={onToggleStage}
          />
        </>
      )}
      {!loading && !unavailable && truncated ? (
        <p className="text-muted-foreground px-2 py-2 text-[11px]">
          {translate(
            'auto.components.coworking.CoworkingGitSidebar.changesLimited',
            'Only part of this status is shown.'
          )}
        </p>
      ) : null}
    </div>
  )
}

function CoworkingChangesSection({
  area,
  canControl,
  collapsed,
  entries,
  mutating,
  scrollElement,
  selectedKey,
  onSelect,
  onToggle,
  onToggleStage
}: {
  area: CoworkingGitStatusEntry['area']
  canControl: boolean
  collapsed: boolean
  entries: readonly CoworkingGitStatusEntry[]
  mutating: boolean
  scrollElement: HTMLDivElement | null
  selectedKey: string | null
  onSelect: (entry: CoworkingGitStatusEntry) => void
  onToggle: () => void
  onToggleStage: (entry: CoworkingGitStatusEntry) => void
}): React.JSX.Element | null {
  if (entries.length === 0) {
    return null
  }
  return (
    <section>
      <SourceControlSectionHeader
        label={
          area === 'staged'
            ? translate('auto.components.right.sidebar.SourceControl.48a003c1b1', 'Staged Changes')
            : translate('auto.components.right.sidebar.SourceControl.d4ef4bafc5', 'Changes')
        }
        count={entries.length}
        conflictCount={entries.filter((entry) => entry.conflicted).length}
        isCollapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed ? (
        <SourceControlVirtualFileList
          rows={entries}
          getRowKey={getCoworkingGitStatusEntryKey}
          scrollElement={scrollElement}
          renderRow={(entry) => (
            <CoworkingChangeRow
              entry={entry}
              canControl={canControl}
              mutating={mutating}
              selected={selectedKey === getCoworkingGitStatusEntryKey(entry)}
              onSelect={() => onSelect(entry)}
              onToggleStage={() => onToggleStage(entry)}
            />
          )}
        />
      ) : null}
    </section>
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
