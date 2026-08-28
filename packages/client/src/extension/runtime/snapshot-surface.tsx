import { useIsRestoring, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { cn } from '~renderer/ui/class-names'

import { getExtensionConnectionSnapshot, subscribeExtensionConnection } from './session'

export function RuntimeSnapshotSurface({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const isRestoring = useIsRestoring()
  const connection = useSyncExternalStore(
    subscribeExtensionConnection,
    getExtensionConnectionSnapshot,
    getExtensionConnectionSnapshot
  )
  const previousConnectionRef = useRef(connection)
  const isReadOnly = isRestoring || connection !== 'connected'

  useEffect(() => {
    const previous = previousConnectionRef.current
    previousConnectionRef.current = connection
    if (connection === 'connected' && previous !== 'connected') {
      void queryClient.invalidateQueries({ refetchType: 'active' })
    }
  }, [connection, queryClient])

  return (
    <div
      aria-busy={isRestoring}
      aria-disabled={isReadOnly}
      data-runtime-snapshot={isReadOnly ? 'read-only' : 'live'}
      className={cn(
        'h-dvh min-h-0 transition-[filter,opacity]',
        isReadOnly &&
          'grayscale opacity-70 [&_a]:pointer-events-none [&_button]:pointer-events-none [&_input]:pointer-events-none [&_select]:pointer-events-none [&_textarea]:pointer-events-none [&_[draggable=true]]:pointer-events-none [&_[role=button]]:pointer-events-none'
      )}
      onDragStartCapture={isReadOnly ? preventInteraction : undefined}
      onDropCapture={isReadOnly ? preventInteraction : undefined}
      onSubmitCapture={isReadOnly ? preventInteraction : undefined}
    >
      {children}
    </div>
  )
}

function preventInteraction(event: React.SyntheticEvent): void {
  event.preventDefault()
  event.stopPropagation()
}
