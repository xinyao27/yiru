import { GitPullRequest } from '@phosphor-icons/react'

import type { PRInfo } from '../../../../shared/types'

export { CHECK_COLOR, CHECK_ICON } from './check-status-presentation'
export { CheckJobLogTail } from './check-job-log-tail'
export {
  buildMergeabilityRecalculationCommands,
  ConflictingFilesSection,
  MergeConflictNotice
} from './checks-panel-conflict-details'
export { PRTriageStrip, ConflictTriageStrip } from './checks-panel-triage-strip'
export { getFailedChecksForDetails } from './checks-panel-check-status'
export { ChecksList } from './checks-panel-checks-list'
export { isMutablePRConversationComment } from './checks-panel-comment-actions'
export { PRCommentsList } from './checks-panel-comments-list'

export const PullRequestIcon = GitPullRequest

export function prStateColor(state: PRInfo['state']): string {
  switch (state) {
    case 'merged':
      return 'bg-purple-500/15 text-purple-500 border-purple-500/20'
    case 'open':
      return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20'
    case 'closed':
      return 'bg-destructive/10 text-destructive border-destructive/20'
    case 'draft':
      return 'bg-muted text-muted-foreground/70 border-border'
  }
}
