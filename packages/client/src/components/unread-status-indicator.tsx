import React from 'react'
import { BellSimple } from '~renderer/components/icons/hugeicons'

export function UnreadStatusIndicator(): React.JSX.Element {
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center text-amber-500">
      <BellSimple className="size-3.5" aria-hidden="true" />
    </span>
  )
}
