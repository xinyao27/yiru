import { Folders as FolderTree } from '@phosphor-icons/react'
import type React from 'react'

import { getPaletteHostBadge } from '@/components/cmd-j/palette-host-badge'
import { RepoBadgeMark } from '@/components/repo/badge-label'
import { CommandItem } from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { PaletteHostBadgeChip } from '../palette-parts'
import type { ProjectTargetPaletteItem } from '../types'
import type { PaletteHostOptionsResult } from '../use-palette-host-options'

type ProjectTargetRowProps = Pick<PaletteHostOptionsResult, 'hostOptions'> & {
  entry: ProjectTargetPaletteItem
  onSelect: (entry: ProjectTargetPaletteItem) => void
}

export function ProjectTargetRow({
  entry,
  hostOptions,
  onSelect
}: ProjectTargetRowProps): React.JSX.Element {
  const result = entry.result
  const isProject = result.kind === 'project'
  const hostBadge = isProject ? getPaletteHostBadge(result.repo, hostOptions) : null
  const badgeLabel = isProject
    ? translate('auto.components.WorktreeJumpPalette.projectBadge', 'Project')
    : translate('auto.components.WorktreeJumpPalette.repoGroupBadge', 'Repo group')
  return (
    <CommandItem
      key={entry.id}
      value={entry.id}
      onSelect={() => onSelect(entry)}
      className={cn(
        'group mx-0.5 flex cursor-pointer items-center gap-3 border border-transparent px-3 py-2.5 text-left outline-none transition-[background-color,border-color]',
        'data-[selected=true]:border-border data-[selected=true]:bg-accent data-[selected=true]:text-foreground'
      )}
    >
      <div className="text-muted-foreground/85 flex w-4 shrink-0 items-center justify-center self-start pt-0.5">
        <FolderTree className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-foreground truncate text-[14px] font-semibold">
                {result.title}
              </span>
              <span className="border-border/60 bg-background/45 text-muted-foreground/88 shrink-0 border px-1.5 py-px text-[9px] leading-normal font-medium">
                {badgeLabel}
              </span>
            </div>
          </div>
          {isProject ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <PaletteHostBadgeChip badge={hostBadge} />
              <span className="border-border bg-muted text-foreground inline-flex max-w-[180px] items-center gap-1.5 border px-2 py-1 text-[11px] leading-none font-semibold">
                <RepoBadgeMark color={result.repo.badgeColor} />
                <span className="truncate">{result.repo.displayName}</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </CommandItem>
  )
}
