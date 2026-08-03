import { HardDrives as Server, HardDrive as ServerOff } from '@phosphor-icons/react'
import type React from 'react'
import { getPaletteHostBadge } from '~renderer/components/cmd-j/palette-host-badge'
import { RepoBadgeMark } from '~renderer/components/repo/badge-label'
import StatusIndicator from '~renderer/components/sidebar/status-indicator'
import { CommandItem } from '~renderer/components/ui/command'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'
import { branchName } from '~renderer/lib/git-utils'
import { getWorktreeStatus, getWorktreeStatusLabel } from '~renderer/lib/worktree-status'

import {
  HighlightedText,
  PaletteHostBadgeChip,
  getPaletteSupportingTextLabel
} from '../palette-parts'
import type { WorktreePaletteItem } from '../types'
import type { PaletteHostOptionsResult } from '../use-palette-host-options'
import type { PaletteStoreState } from '../use-palette-store-state'
import type { WorktreeSearchResult } from '../use-worktree-search'

type WorktreeRowProps = Pick<
  PaletteStoreState,
  | 'tabsByWorktree'
  | 'browserTabsByWorktree'
  | 'ptyIdsByTabId'
  | 'runtimePaneTitlesByTabId'
  | 'activeWorktreeId'
  | 'sshConnectionStates'
> &
  Pick<PaletteHostOptionsResult, 'repoMap' | 'hostOptions'> &
  Pick<WorktreeSearchResult, 'liveAgentStatusByWorktreeId'> & {
    entry: WorktreePaletteItem
    onSelect: (entry: WorktreePaletteItem) => void
  }

export function WorktreeRow({
  entry,
  repoMap,
  hostOptions,
  tabsByWorktree,
  browserTabsByWorktree,
  ptyIdsByTabId,
  runtimePaneTitlesByTabId,
  liveAgentStatusByWorktreeId,
  activeWorktreeId,
  sshConnectionStates,
  onSelect
}: WorktreeRowProps): React.JSX.Element {
  const worktree = entry.worktree
  const repo = repoMap.get(worktree.repoId)
  const repoName = repo?.displayName ?? ''
  const branch = branchName(worktree.branch)
  const status = getWorktreeStatus(
    tabsByWorktree[worktree.id] ?? [],
    browserTabsByWorktree[worktree.id] ?? [],
    ptyIdsByTabId,
    runtimePaneTitlesByTabId,
    { liveAgentStatus: liveAgentStatusByWorktreeId.get(worktree.id) }
  )
  const statusLabel = getWorktreeStatusLabel(status)
  const isCurrentWorktree = activeWorktreeId === worktree.id
  const sshConnectionId = repo?.connectionId || null
  const sshStatus = sshConnectionId
    ? (sshConnectionStates.get(sshConnectionId)?.status ?? 'disconnected')
    : null
  const isSshDisconnected = sshStatus != null && sshStatus !== 'connected'
  const hostBadge = getPaletteHostBadge(repo, hostOptions)

  return (
    <CommandItem
      key={entry.id}
      value={entry.id}
      onSelect={() => onSelect(entry)}
      data-current={isCurrentWorktree ? 'true' : undefined}
      className={cn(
        'group mx-0.5 flex cursor-pointer items-center gap-3 border border-transparent px-3 py-2.5 text-left outline-none transition-[background-color,border-color]',
        'data-[selected=true]:border-border data-[selected=true]:bg-accent data-[selected=true]:text-foreground'
      )}
    >
      {/* Why: single-line rows center the status with the title; search context
      keeps it pinned to the first line instead of centering across both lines. */}
      <div
        className={cn(
          'flex w-4 shrink-0 items-center justify-center',
          entry.match.supportingText ? 'self-start pt-0.5' : 'self-center'
        )}
      >
        <StatusIndicator status={status} aria-hidden="true" />
        <span className="sr-only">{statusLabel}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              {sshConnectionId && (
                <span
                  aria-label={
                    isSshDisconnected
                      ? translate(
                          'auto.components.WorktreeJumpPalette.63c2be1914',
                          'SSH disconnected'
                        )
                      : translate('auto.components.WorktreeJumpPalette.34c8fbb46e', 'SSH remote')
                  }
                  className="inline-flex shrink-0 items-center"
                >
                  {isSshDisconnected ? (
                    <ServerOff className="size-3.5 text-red-400" aria-hidden="true" />
                  ) : (
                    <Server className="text-muted-foreground size-3.5" aria-hidden="true" />
                  )}
                </span>
              )}
              <span className="text-foreground truncate text-[14px] font-semibold">
                {entry.match.displayNameRange ? (
                  <HighlightedText
                    text={worktree.displayName}
                    matchRange={entry.match.displayNameRange}
                  />
                ) : (
                  worktree.displayName
                )}
              </span>
              {isCurrentWorktree && (
                <span className="border-border/60 bg-background/45 text-muted-foreground/88 shrink-0 self-center border px-1.5 py-px text-[9px] leading-normal font-medium">
                  {translate('auto.components.WorktreeJumpPalette.556e7232ca', 'Current')}
                </span>
              )}
              {worktree.isMainWorktree && (
                <span className="border-muted-foreground/30 bg-muted-foreground/5 text-muted-foreground shrink-0 self-center border px-1.5 py-px text-[9px] leading-normal font-medium">
                  {translate('auto.components.WorktreeJumpPalette.739bda980c', 'primary')}
                </span>
              )}
              <span className="text-muted-foreground/45 shrink-0">·</span>
              <span className="text-muted-foreground/92 truncate text-[12px] font-medium">
                {entry.match.branchRange ? (
                  <HighlightedText text={branch} matchRange={entry.match.branchRange} />
                ) : (
                  branch
                )}
              </span>
            </div>
            {entry.match.supportingText && (
              <div className="text-muted-foreground/88 mt-1.5 flex min-w-0 items-center gap-2 text-[12px] leading-5">
                <span className="border-border bg-foreground/[0.04] text-muted-foreground inline-flex h-[18px] shrink-0 items-center border px-1.5 text-[10px] font-semibold tracking-wide uppercase">
                  {getPaletteSupportingTextLabel(entry.match.supportingText.labelKind)}
                </span>
                <span className="truncate">
                  <HighlightedText
                    text={entry.match.supportingText.text}
                    matchRange={entry.match.supportingText.matchRange}
                  />
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PaletteHostBadgeChip badge={hostBadge} />
            {repoName && (
              <span className="border-border bg-muted text-foreground inline-flex max-w-[180px] items-center gap-1.5 border px-2 py-1 text-[11px] leading-none font-semibold">
                <RepoBadgeMark color={repo?.badgeColor} />
                <span className="truncate">
                  {entry.match.repoRange ? (
                    <HighlightedText text={repoName} matchRange={entry.match.repoRange} />
                  ) : (
                    repoName
                  )}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </CommandItem>
  )
}
