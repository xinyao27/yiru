import React from 'react'
import { Check, Circle } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'
import type { PendingWorktreeCreation } from '~renderer/worktree-creation/pending'

import { getWorktreeCreationSteps } from './progress'

export function WorktreeCreationProgressChecklist({
  entry
}: {
  entry: PendingWorktreeCreation
}): React.JSX.Element {
  return (
    <ol className="flex flex-col gap-1.5" aria-live="polite">
      {getWorktreeCreationSteps(entry).map((step) => (
        <li
          key={step.id}
          className={cn(
            'flex items-center gap-2',
            step.state === 'pending' && 'text-muted-foreground/55',
            step.state === 'active' && 'text-foreground'
          )}
        >
          <span className="flex size-3.5 shrink-0 items-center justify-center">
            {step.state === 'complete' ? (
              <Check className="text-success size-3.5" />
            ) : step.state === 'active' ? (
              <LoadingIndicator className="size-3.5" />
            ) : (
              <Circle className="size-2.5" />
            )}
          </span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  )
}
