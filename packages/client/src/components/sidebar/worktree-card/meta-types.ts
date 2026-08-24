import type { WorktreeCardDetailsHoverControl } from './details-hover-state'
import type { WorktreeCardPrDisplay } from './pr-display'

export type WorktreeCardMetaBadgesProps = {
  review: WorktreeCardPrDisplay | null
  comment: string | null
}

export type WorktreeCardMetaBadgesRootProps = WorktreeCardMetaBadgesProps &
  React.HTMLAttributes<HTMLDivElement>

export type WorktreeCardDetailsHoverProps = WorktreeCardMetaBadgesProps & {
  children: React.ReactElement
  branchName?: string
  workspaceTitle?: string
  identityOrder?: 'workspace-first' | 'branch-first'
  workspaceTitleRenameDisabled?: boolean
  detailsAfter?: React.ReactNode
  openDelay?: number
  closeDelay?: number
  onRenameWorkspaceTitle?: (displayName: string) => Promise<void> | void
  onWorkspaceTitleEditingChange?: (editing: boolean) => void
  onEditComment?: (event: React.MouseEvent) => void
  onOpenReviewInYiru?: (event: React.MouseEvent) => void
  onUnlinkReview?: () => void
  hoverControl?: WorktreeCardDetailsHoverControl
}
