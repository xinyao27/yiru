import React from 'react'

export function EmptyState({
  heading,
  supportingText
}: {
  heading: string
  supportingText: string
}): React.JSX.Element {
  return (
    <div className="px-4 py-6">
      <div className="text-foreground text-sm font-medium">{heading}</div>
      <div className="text-muted-foreground mt-1 text-xs">{supportingText}</div>
    </div>
  )
}
