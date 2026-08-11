import { Plus } from '@phosphor-icons/react'
import type React from 'react'
import { CommandItem } from '~renderer/components/ui/command'
import { CREATE_WORKTREE_ITEM_ID } from '~renderer/components/worktree-jump-palette/worktree-palette-create-action'
import { translate } from '~renderer/i18n/i18n'

import type { HintRow as HintRowEntry, SectionHeader as SectionHeaderEntry } from '../types'

export function SectionHeaderRow({ entry }: { entry: SectionHeaderEntry }): React.JSX.Element {
  return (
    <div
      key={entry.id}
      className="text-muted-foreground/70 mx-0.5 mt-3 mb-1 px-3 text-[11px] font-medium tracking-wider uppercase"
    >
      {entry.label}
    </div>
  )
}

export function HintTextRow({ entry }: { entry: HintRowEntry }): React.JSX.Element {
  // Why: plain div (not CommandItem) so cmdk can't land selection
  // on it and arrow keys skip over it naturally via selectableItems.
  return (
    <div
      key={entry.id}
      className="text-muted-foreground/70 mx-0.5 mt-1 px-3 py-1.5 text-[12px] italic"
    >
      {entry.label}
    </div>
  )
}

export function CreateWorktreeRow({
  createWorktreeName,
  onSelect
}: {
  createWorktreeName: string
  onSelect: () => void
}): React.JSX.Element {
  return (
    <CommandItem
      key={CREATE_WORKTREE_ITEM_ID}
      value={CREATE_WORKTREE_ITEM_ID}
      onSelect={onSelect}
      className="group data-[selected=true]:border-border data-[selected=true]:bg-accent data-[selected=true]:text-foreground mx-0.5 mt-1 flex cursor-pointer items-center gap-3 border border-transparent px-3 py-1.5 text-left transition-[background-color,border-color] outline-none"
    >
      <div className="border-border/60 bg-muted/25 text-muted-foreground/70 flex h-5 w-5 shrink-0 items-center justify-center border border-dashed">
        <Plus size={13} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-[14px] font-semibold tracking-[-0.01em]">
          {translate(
            'auto.components.WorktreeJumpPalette.95be6587d3',
            'Create worktree "{{value0}}"',
            { value0: createWorktreeName }
          )}
        </div>
      </div>
    </CommandItem>
  )
}
