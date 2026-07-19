import type { JSX } from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'

// Why: React must own the configured loader while the surrounding storyboard
// imperatively reveals it and types into the adjacent text node.
export function ReviewNotesTerminalTail(): JSX.Element {
  return (
    <div className="ravs-term-line" data-term-line-tail>
      <LoadingIndicator
        className="text-foreground mr-1.5 size-2 align-[-1px]"
        data-term-spinner
        hidden
      />
      <span className="ravs-term-muted" data-term-tail-text />
    </div>
  )
}
