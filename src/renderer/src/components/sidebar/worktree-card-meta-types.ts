import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { AutomationWorkspaceProvenance } from '../../../../shared/types'
import type { WorktreeCardPrDisplay } from './worktree-card-pr-display'
import type { WorktreeCardDetailsHoverControl } from './worktree-card-details-hover-state'

export type WorktreeCardMetaBadgesProps = {
  review: WorktreeCardPrDisplay | null
  comment: string | null
  automationProvenance?: AutomationWorkspaceProvenance | null
}

export type WorktreeCardMetaBadgesRootProps = WorktreeCardMetaBadgesProps &
  React.HTMLAttributes<HTMLDivElement>

export type WorktreeCardDetailsHoverProps = WorktreeCardMetaBadgesProps & {
  children: React.ReactElement
  branchName?: string
  workspaceTitle?: string
  identityOrder?: 'workspace-first' | 'branch-first'
  workspaceTitleRenameDisabled?: boolean
  automationHostId?: ExecutionHostId
  detailsAfter?: React.ReactNode
  openDelay?: number
  closeDelay?: number
  onRenameWorkspaceTitle?: (displayName: string) => Promise<void> | void
  onWorkspaceTitleEditingChange?: (editing: boolean) => void
  onEditComment?: (event: React.MouseEvent) => void
  onOpenReviewInYiru?: (event: React.MouseEvent) => void
  onUnlinkReview?: () => void
  onOpenAutomation?: (event: React.MouseEvent) => void
  onOpenAutomationRun?: (event: React.MouseEvent) => void
  hoverControl?: WorktreeCardDetailsHoverControl
}
