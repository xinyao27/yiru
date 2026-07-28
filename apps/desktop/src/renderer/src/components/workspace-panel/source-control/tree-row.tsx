import React from 'react'

import { cn } from '../../../lib/class-names'
import {
  SOURCE_CONTROL_TREE_DIRECTORY_PADDING_PX,
  SOURCE_CONTROL_TREE_FILE_PADDING_PX,
  SOURCE_CONTROL_TREE_INDENT_PX
} from './panel-constants'

type SourceControlTreeRowProps = Omit<React.ComponentProps<'div'>, 'className' | 'style'> & {
  depth: number
  rowType: 'directory' | 'file'
  isCurrent?: boolean
}

export function SourceControlTreeRow({
  depth,
  rowType,
  isCurrent = false,
  children,
  ...props
}: SourceControlTreeRowProps): React.JSX.Element {
  const padding =
    rowType === 'directory'
      ? SOURCE_CONTROL_TREE_DIRECTORY_PADDING_PX
      : SOURCE_CONTROL_TREE_FILE_PADDING_PX

  return (
    <div
      {...props}
      data-current={isCurrent ? 'true' : undefined}
      className={cn(
        'group hover:bg-accent focus-within:bg-accent relative flex items-center gap-1 py-1 pr-3 transition-colors',
        rowType === 'file'
          ? 'cursor-pointer'
          : 'text-muted-foreground hover:text-foreground focus-within:text-foreground',
        isCurrent && 'bg-accent'
      )}
      style={{ paddingLeft: `${depth * SOURCE_CONTROL_TREE_INDENT_PX + padding}px` }}
    >
      {children}
    </div>
  )
}

export function SourceControlRowActions({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  // Why: faded actions stay mounted so their tooltip triggers remain
  // measurable and keyboard focus can reveal them.
  return (
    <div className="bg-accent pointer-events-none absolute inset-y-0 right-0 flex shrink-0 items-center gap-1.5 pr-3 pl-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
      {children}
    </div>
  )
}
