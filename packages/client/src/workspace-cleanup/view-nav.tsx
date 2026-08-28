import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import type { WorkspaceCleanupView, WorkspaceCleanupViewCounts } from './view-selection'

type CleanupViewNavProps = {
  activeView: WorkspaceCleanupView
  counts: WorkspaceCleanupViewCounts
  onViewChange: (view: WorkspaceCleanupView) => void
}

export function CleanupViewNav({
  activeView,
  counts,
  onViewChange
}: CleanupViewNavProps): React.JSX.Element {
  const items: { view: WorkspaceCleanupView; label: string }[] = [
    {
      view: 'ready',
      label: translate(
        'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4b93a235d8',
        'Suggested'
      )
    },
    {
      view: 'review',
      label: translate(
        'auto.components.workspace.cleanup.WorkspaceCleanupDialog.d1094dd529',
        'Needs review'
      )
    },
    {
      view: 'protected',
      label: translate(
        'auto.components.workspace.cleanup.WorkspaceCleanupDialog.c4f4782c02',
        'Not suggested'
      )
    },
    {
      view: 'hidden',
      label: translate(
        'auto.components.workspace.cleanup.WorkspaceCleanupDialog.e8b3741ff7',
        'Ignored'
      )
    }
  ]

  return (
    <aside className="border-border bg-background border-t md:border-t-0">
      <div className="space-y-1 p-2">
        {items.map((item) => (
          <Button
            variant="ghost"
            size="sm"
            key={item.view}
            type="button"
            className={cn(
              'border-0 whitespace-normal font-normal focus-visible:bg-accent focus-visible:text-accent-foreground',
              'flex w-full justify-between gap-2 px-2 text-left text-xs text-muted-foreground transition-colors',
              activeView === item.view && 'bg-accent text-accent-foreground'
            )}
            onClick={() => onViewChange(item.view)}
          >
            <span className="truncate">{item.label}</span>
            <span className="text-muted-foreground tabular-nums">{counts[item.view]}</span>
          </Button>
        ))}
      </div>
    </aside>
  )
}
