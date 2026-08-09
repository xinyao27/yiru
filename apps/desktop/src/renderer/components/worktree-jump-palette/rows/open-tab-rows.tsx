import {
  FileText,
  GitBranch,
  Globe,
  DeviceMobile as Smartphone,
  TerminalWindow as SquareTerminal
} from '@phosphor-icons/react'
import type React from 'react'
import { getPaletteHostBadge } from '~renderer/components/cmd-j/palette-host-badge'
import { RepoBadgeMark } from '~renderer/components/repo/badge-label'
import { CommandItem } from '~renderer/components/ui/command'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'

import { HighlightedText, PaletteHostBadgeChip } from '../palette-parts'
import type { BrowserPaletteItem, SimulatorPaletteItem, WorkspaceTabPaletteItem } from '../types'
import type { PaletteHostOptionsResult } from '../use-palette-host-options'
import type { WorktreeSearchResult } from '../use-worktree-search'

const ROW_CLASS_NAME = cn(
  'group mx-0.5 flex cursor-pointer items-center gap-3 border border-transparent px-3 py-2.5 text-left outline-none transition-[background-color,border-color]',
  'data-[selected=true]:border-border data-[selected=true]:bg-accent data-[selected=true]:text-foreground'
)

type OpenTabRowContext = Pick<WorktreeSearchResult, 'worktreeMap'> &
  Pick<PaletteHostOptionsResult, 'repoMap' | 'hostOptions'>

export function WorkspaceTabRow({
  entry,
  worktreeMap,
  repoMap,
  hostOptions,
  onSelect
}: OpenTabRowContext & {
  entry: WorkspaceTabPaletteItem
  onSelect: (entry: WorkspaceTabPaletteItem) => void
}): React.JSX.Element {
  const result = entry.result
  const workspaceTabWorktree = worktreeMap.get(result.worktreeId)
  const workspaceTabRepo = workspaceTabWorktree
    ? repoMap.get(workspaceTabWorktree.repoId)
    : undefined
  const workspaceTabRepoName = workspaceTabRepo?.displayName ?? result.repoName
  const workspaceTabHostBadge = getPaletteHostBadge(workspaceTabRepo, hostOptions)
  const WorkspaceTabIcon =
    result.contentType === 'terminal'
      ? SquareTerminal
      : result.contentType === 'git-graph'
        ? GitBranch
        : FileText

  return (
    <CommandItem
      key={entry.id}
      value={entry.id}
      onSelect={() => onSelect(entry)}
      className={ROW_CLASS_NAME}
    >
      <div className="text-muted-foreground/85 flex w-4 shrink-0 items-center justify-center self-center">
        <WorkspaceTabIcon className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-foreground max-w-[40%] shrink-0 truncate text-[14px] font-semibold tracking-[-0.01em]">
                <HighlightedText text={result.title} matchRange={result.titleRange} />
              </span>
              {result.isCurrentTab && (
                <span className="border-border/60 bg-background/45 text-muted-foreground/88 shrink-0 self-center border px-1.5 py-px text-[9px] leading-normal font-medium">
                  {translate('auto.components.WorktreeJumpPalette.52404f8096', 'Current Tab')}
                </span>
              )}
              {!result.isCurrentTab && result.isCurrentWorktree && (
                <span className="border-border/60 bg-background/45 text-muted-foreground/88 shrink-0 self-center border px-1.5 py-px text-[9px] leading-normal font-medium">
                  {translate('auto.components.WorktreeJumpPalette.c5081f2814', 'Current Worktree')}
                </span>
              )}
              <span className="text-muted-foreground/45 shrink-0">·</span>
              <span className="text-muted-foreground/92 min-w-0 truncate text-[12px] font-medium">
                <HighlightedText text={result.secondaryText} matchRange={result.secondaryRange} />
              </span>
              <span className="text-muted-foreground/45 shrink-0">·</span>
              <span className="text-muted-foreground/92 shrink-0 text-[12px] font-medium">
                <HighlightedText text={result.worktreeName} matchRange={result.worktreeRange} />
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PaletteHostBadgeChip badge={workspaceTabHostBadge} />
            {workspaceTabRepoName && (
              <span className="border-border bg-muted text-foreground inline-flex max-w-[180px] items-center gap-1.5 border px-2 py-1 text-[11px] leading-none font-semibold">
                <RepoBadgeMark color={workspaceTabRepo?.badgeColor} />
                <span className="truncate">
                  <HighlightedText text={workspaceTabRepoName} matchRange={result.repoRange} />
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </CommandItem>
  )
}

export function SimulatorTabRow({
  entry,
  worktreeMap,
  repoMap,
  hostOptions,
  onSelect
}: OpenTabRowContext & {
  entry: SimulatorPaletteItem
  onSelect: (entry: SimulatorPaletteItem) => void
}): React.JSX.Element {
  const result = entry.result
  const simulatorWorktree = worktreeMap.get(result.worktreeId)
  const simulatorRepo = simulatorWorktree ? repoMap.get(simulatorWorktree.repoId) : undefined
  const simulatorRepoName = simulatorRepo?.displayName ?? result.repoName
  const simulatorHostBadge = getPaletteHostBadge(simulatorRepo, hostOptions)

  return (
    <CommandItem
      key={entry.id}
      value={entry.id}
      onSelect={() => onSelect(entry)}
      className={ROW_CLASS_NAME}
    >
      <div className="text-muted-foreground/85 flex w-4 shrink-0 items-center justify-center self-center">
        <Smartphone className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-foreground max-w-[40%] shrink-0 truncate text-[14px] font-semibold tracking-[-0.01em]">
                <HighlightedText text={result.title} matchRange={result.titleRange} />
              </span>
              {result.isCurrentTab && (
                <span className="border-border/60 bg-background/45 text-muted-foreground/88 shrink-0 self-center border px-1.5 py-px text-[9px] leading-normal font-medium">
                  {translate('auto.components.WorktreeJumpPalette.52404f8096', 'Current Tab')}
                </span>
              )}
              {!result.isCurrentTab && result.isCurrentWorktree && (
                <span className="border-border/60 bg-background/45 text-muted-foreground/88 shrink-0 self-center border px-1.5 py-px text-[9px] leading-normal font-medium">
                  {translate('auto.components.WorktreeJumpPalette.c5081f2814', 'Current Worktree')}
                </span>
              )}
              <span className="text-muted-foreground/45 shrink-0">·</span>
              <span className="text-muted-foreground/92 min-w-0 truncate text-[12px] font-medium">
                <HighlightedText text={result.secondaryText} matchRange={result.secondaryRange} />
              </span>
              <span className="text-muted-foreground/45 shrink-0">·</span>
              <span className="text-muted-foreground/92 shrink-0 text-[12px] font-medium">
                <HighlightedText text={result.worktreeName} matchRange={result.worktreeRange} />
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PaletteHostBadgeChip badge={simulatorHostBadge} />
            {simulatorRepoName && (
              <span className="border-border bg-muted text-foreground inline-flex max-w-[180px] items-center gap-1.5 border px-2 py-1 text-[11px] leading-none font-semibold">
                <RepoBadgeMark color={simulatorRepo?.badgeColor} />
                <span className="truncate">
                  <HighlightedText text={simulatorRepoName} matchRange={result.repoRange} />
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </CommandItem>
  )
}

export function BrowserPageRow({
  entry,
  worktreeMap,
  repoMap,
  hostOptions,
  onSelect
}: OpenTabRowContext & {
  entry: BrowserPaletteItem
  onSelect: (entry: BrowserPaletteItem) => void
}): React.JSX.Element {
  const result = entry.result
  const browserWorktree = worktreeMap.get(result.worktreeId)
  const browserRepo = browserWorktree ? repoMap.get(browserWorktree.repoId) : undefined
  const browserRepoName = browserRepo?.displayName ?? result.repoName
  const browserHostBadge = getPaletteHostBadge(browserRepo, hostOptions)

  return (
    <CommandItem
      key={entry.id}
      value={entry.id}
      onSelect={() => onSelect(entry)}
      className={ROW_CLASS_NAME}
    >
      <div className="text-muted-foreground/85 flex w-4 shrink-0 items-center justify-center self-center">
        <Globe className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-foreground max-w-[40%] shrink-0 truncate text-[14px] font-semibold tracking-[-0.01em]">
                <HighlightedText text={result.title} matchRange={result.titleRange} />
              </span>
              {result.isCurrentPage && (
                <span className="border-border/60 bg-background/45 text-muted-foreground/88 shrink-0 self-center border px-1.5 py-px text-[9px] leading-normal font-medium">
                  {translate('auto.components.WorktreeJumpPalette.52404f8096', 'Current Tab')}
                </span>
              )}
              {!result.isCurrentPage && result.isCurrentWorktree && (
                <span className="border-border/60 bg-background/45 text-muted-foreground/88 shrink-0 self-center border px-1.5 py-px text-[9px] leading-normal font-medium">
                  {translate('auto.components.WorktreeJumpPalette.c5081f2814', 'Current Worktree')}
                </span>
              )}
              <span className="text-muted-foreground/45 shrink-0">·</span>
              <span className="text-muted-foreground/92 min-w-0 truncate text-[12px] font-medium">
                <HighlightedText text={result.secondaryText} matchRange={result.secondaryRange} />
              </span>
              <span className="text-muted-foreground/45 shrink-0">·</span>
              <span className="text-muted-foreground/92 shrink-0 text-[12px] font-medium">
                <HighlightedText text={result.worktreeName} matchRange={result.worktreeRange} />
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PaletteHostBadgeChip badge={browserHostBadge} />
            {browserRepoName && (
              <span className="border-border bg-muted text-foreground inline-flex max-w-[180px] items-center gap-1.5 border px-2 py-1 text-[11px] leading-none font-semibold">
                <RepoBadgeMark color={browserRepo?.badgeColor} />
                <span className="truncate">
                  <HighlightedText text={browserRepoName} matchRange={result.repoRange} />
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </CommandItem>
  )
}
