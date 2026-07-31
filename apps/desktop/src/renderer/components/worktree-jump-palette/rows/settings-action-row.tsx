import type React from 'react'
import { CommandItem } from '~renderer/components/ui/command'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'

import type { QuickActionPaletteItem, SettingsPaletteItem } from '../types'

type SettingsOrQuickActionRowProps = {
  entry: SettingsPaletteItem | QuickActionPaletteItem
  onSelect: (entry: SettingsPaletteItem | QuickActionPaletteItem) => void
}

export function SettingsOrQuickActionRow({
  entry,
  onSelect
}: SettingsOrQuickActionRowProps): React.JSX.Element {
  const result = entry.result
  const Icon = result.icon
  const kindLabel =
    entry.type === 'settings'
      ? translate('auto.components.WorktreeJumpPalette.settingsBadge', 'Settings')
      : translate('auto.components.WorktreeJumpPalette.actionBadge', 'Action')
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
        <Icon className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-foreground truncate text-[14px] font-semibold tracking-[-0.01em]">
            {result.title}
          </span>
          <span className="border-border/60 bg-background/45 text-muted-foreground/88 shrink-0 border px-1.5 py-px text-[9px] leading-normal font-medium">
            {kindLabel}
          </span>
        </div>
        <div className="text-muted-foreground/88 mt-1 truncate text-[12px] leading-5">
          {result.description}
        </div>
      </div>
    </CommandItem>
  )
}
