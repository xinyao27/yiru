import {
  Folder,
  FolderOpen,
  Link,
  Prohibit as CircleSlash,
  CaretRight as ChevronRight
} from '@phosphor-icons/react'
import type React from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { getFileTypeIcon } from '@/lib/file-type-icons'

import type { GitFileStatus } from '../../../../shared/types'
import type { TreeNode } from './file-explorer-types'
import { STATUS_LABELS } from './status-display'

type FileExplorerTreeRowButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  buttonRef?: React.Ref<HTMLButtonElement>
  node: TreeNode
  isExpanded: boolean
  isLoading: boolean
  isSelected: boolean
  isFlashing?: boolean
  nodeStatus?: GitFileStatus | null
  statusColor?: string | null
  isIgnored?: boolean
  onLabelDoubleClick?: (event: React.MouseEvent<HTMLSpanElement>) => void
}

/** The canonical visual and interaction surface for one Worktree Explorer row. */
export function FileExplorerTreeRowButton({
  buttonRef,
  node,
  isExpanded,
  isLoading,
  isSelected,
  isFlashing = false,
  nodeStatus = null,
  statusColor = null,
  isIgnored = false,
  onLabelDoubleClick,
  className,
  style,
  ...buttonProps
}: FileExplorerTreeRowButtonProps): React.JSX.Element {
  const FileIcon = getFileTypeIcon(node.relativePath || node.name)
  return (
    <Button
      variant="ghost"
      size="xs"
      {...buttonProps}
      ref={buttonRef}
      type={buttonProps.type ?? 'button'}
      data-file-explorer-row=""
      data-selected={isSelected ? 'true' : undefined}
      className={cn(
        'h-auto border-0 justify-start whitespace-normal font-normal flex w-full py-1 text-left transition-colors',
        // Why: flat accent nearly disappears against the light explorer panel.
        isSelected
          ? 'bg-[color-mix(in_srgb,var(--foreground)_8%,var(--accent))] text-accent-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_10%,var(--accent))] dark:bg-[color-mix(in_srgb,var(--accent)_70%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--accent)_80%,transparent)]'
          : 'hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground',
        isFlashing && !isSelected && 'bg-accent',
        className
      )}
      style={{ ...style, paddingLeft: `${node.depth * 16 + 8}px` }}
    >
      {node.isDirectory ? (
        <>
          <ChevronRight
            weight="regular"
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
          {isLoading ? (
            <LoadingIndicator className="text-muted-foreground size-3 shrink-0" />
          ) : isExpanded ? (
            <FolderOpen className="text-muted-foreground size-3 shrink-0" />
          ) : (
            <Folder className="text-muted-foreground size-3 shrink-0" />
          )}
        </>
      ) : (
        <>
          <span className="size-3 shrink-0" />
          {node.isSymlink ? (
            <Link className="text-muted-foreground size-3 shrink-0" />
          ) : (
            <FileIcon className="text-muted-foreground size-3 shrink-0" />
          )}
        </>
      )}
      <span
        className={cn(
          'truncate',
          isSelected && !nodeStatus && !isIgnored && 'text-accent-foreground',
          isIgnored && 'italic'
        )}
        style={
          nodeStatus
            ? { color: statusColor ?? undefined }
            : isIgnored
              ? { color: 'var(--git-decoration-ignored)' }
              : undefined
        }
        onDoubleClick={onLabelDoubleClick}
      >
        {node.name}
      </span>
      {nodeStatus ? (
        <span
          className="mr-2 ml-auto shrink-0 text-[10px] font-semibold tracking-wide"
          style={{ color: statusColor ?? undefined }}
        >
          {STATUS_LABELS[nodeStatus]}
        </span>
      ) : isIgnored ? (
        <CircleSlash
          aria-label={translate(
            'auto.components.right.sidebar.FileExplorerRow.e26010014a',
            'Ignored by .gitignore'
          )}
          className="mr-2 ml-auto size-3 shrink-0"
          style={{ color: 'var(--git-decoration-ignored)' }}
        />
      ) : null}
    </Button>
  )
}
