import type React from 'react'
import {
  CaretRight as ChevronRight,
  Folder,
  FolderOpen,
  Link,
  Prohibit as CircleSlash,
  SpinnerGap as Loader2
} from '@phosphor-icons/react'
import type { GitFileStatus } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import { cn } from '@/lib/class-names'
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
    <button
      {...buttonProps}
      ref={buttonRef}
      type={buttonProps.type ?? 'button'}
      data-file-explorer-row=""
      data-selected={isSelected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-1 rounded-sm px-2 py-1 text-left text-xs transition-colors',
        !isSelected && 'hover:bg-accent hover:text-foreground',
        isSelected && 'text-accent-foreground',
        isFlashing && 'bg-accent ring-1 ring-inset ring-ring',
        className
      )}
      style={{ ...style, paddingLeft: `${node.depth * 16 + 8}px` }}
    >
      {node.isDirectory ? (
        <>
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
          {isLoading ? (
            <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
          ) : isExpanded ? (
            <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-3 shrink-0 text-muted-foreground" />
          )}
        </>
      ) : (
        <>
          <span className="size-3 shrink-0" />
          {node.isSymlink ? (
            <Link className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <FileIcon className="size-3 shrink-0 text-muted-foreground" />
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
          className="ml-auto mr-2 shrink-0 text-[10px] font-semibold tracking-wide"
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
          className="ml-auto mr-2 size-3 shrink-0"
          style={{ color: 'var(--git-decoration-ignored)' }}
        />
      ) : null}
    </button>
  )
}
