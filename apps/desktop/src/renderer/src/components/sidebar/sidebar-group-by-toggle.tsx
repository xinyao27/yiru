import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { GROUP_BY_OPTIONS } from './sidebar-workspace-option-items'
import type { WorktreeGroupBy } from './worktree-list-groups'

type SidebarGroupByToggleProps = {
  groupBy: WorktreeGroupBy
  setGroupBy: (groupBy: WorktreeGroupBy) => void
}

export function SidebarGroupByToggle({ groupBy, setGroupBy }: SidebarGroupByToggleProps) {
  return (
    <ToggleGroup
      value={[groupBy]}
      onValueChange={(value) => {
        const next = value[0]
        if (next) {
          setGroupBy(next as WorktreeGroupBy)
        }
      }}
      variant="outline"
      size="sm"
      className="h-6 w-full justify-stretch"
    >
      {GROUP_BY_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.id}
          value={option.id}
          // Why: inside the dropdown menu, Radix can focus a toggle item without
          // committing ToggleGroup's value change; capture the pointer intent
          // before the menu's roving-focus handling turns it into a no-op.
          onPointerDownCapture={() => setGroupBy(option.id)}
          className="data-[state=on]:bg-foreground/10 data-[state=on]:text-foreground h-6 grow basis-0 px-1 text-[10px] data-[state=on]:font-semibold"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
