import { BellSimple } from '@phosphor-icons/react'
import React from 'react'

export function UnreadStatusIndicator(): React.JSX.Element {
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center text-amber-500">
      <BellSimple className="size-3.5" weight="fill" aria-hidden="true" />
    </span>
  )
}
