import type React from 'react'

import type { PaletteHostBadge } from '@/components/cmd-j/palette-host-badge'
import type {
  MatchRange,
  PaletteSearchResult
} from '@/components/worktree-jump-palette/worktree-palette-search'
import { translate } from '@/i18n/i18n'

export function HighlightedText({
  text,
  matchRange
}: {
  text: string
  matchRange: MatchRange | null
}): React.JSX.Element {
  if (!matchRange) {
    return <>{text}</>
  }
  const before = text.slice(0, matchRange.start)
  const match = text.slice(matchRange.start, matchRange.end)
  const after = text.slice(matchRange.end)
  return (
    <>
      {before}
      <span className="text-foreground font-semibold">{match}</span>
      {after}
    </>
  )
}

export function PaletteState({
  title,
  subtitle
}: {
  title: string
  subtitle: string
}): React.JSX.Element {
  return (
    <div className="px-5 py-8 text-center">
      <p className="text-foreground text-sm font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>
    </div>
  )
}

export function FooterKey({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="border-border/60 bg-muted/35 text-foreground/85 border px-2 py-0.5 text-[10px] font-medium">
      {children}
    </span>
  )
}

export function PaletteHostBadgeChip({
  badge
}: {
  badge: PaletteHostBadge | null
}): React.JSX.Element | null {
  if (!badge) {
    return null
  }
  // Host labels come from the registry and are intentionally not translated.
  return (
    <span
      aria-label={translate(
        'auto.components.WorktreeJumpPalette.paletteHostBadge',
        'Host: {{value0}}',
        { value0: badge.label }
      )}
      className="border-border/60 bg-background/45 text-muted-foreground/88 max-w-[140px] truncate border px-1.5 py-px text-[9px] leading-normal font-medium"
    >
      {badge.label}
    </span>
  )
}

export function getPaletteSupportingTextLabel(
  labelKind: NonNullable<PaletteSearchResult['supportingText']>['labelKind']
): string {
  switch (labelKind) {
    case 'comment':
      return translate('worktreeJumpPalette.matchLabel.comment', 'Comment')
    case 'port':
      return translate('worktreeJumpPalette.matchLabel.port', 'Port')
    case 'pr':
      return translate('worktreeJumpPalette.matchLabel.pr', 'PR')
    case 'mr':
      return translate('worktreeJumpPalette.matchLabel.mr', 'MR')
  }
}
