import React from 'react'

import { SpoolGitPane } from '@/components/spool/spool-git-pane'

import {
  LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  type RightSidebarPanelSource
} from './right-sidebar-panel-source'
import { useSourceControlController } from './source-control-controller'
import { SourceControlPanel } from './source-control-panel'

export { HostedReviewHeaderLink } from './hosted-review-header-chrome'
export {
  appendCommitFailureCustomInstruction,
  appendPushFailureCustomInstruction,
  buildCommitFailureAgentCommandInput,
  buildFixCommitFailurePrompt,
  buildFixPushFailurePrompt,
  buildPushFailureAgentCommandInput,
  buildResolveConflictsPrompt,
  buildResolvePullRequestConflictsPrompt
} from './source-control-ai-prompts'
export {
  resolveSourceControlBaseRef,
  resolveSourceControlCompareBaseRef,
  resolveSourceControlPickerBaseRef,
  shouldClearBranchCompareForMissingBase
} from './source-control-base-ref'
export {
  CompareSummary,
  CompareSummaryToolbarButton,
  shouldRefreshBranchCompareForRemoteStatus,
  shouldRefreshBranchCompareForStatusHead,
  shouldShowCompareSummary
} from './source-control-compare-summary'
export { CommitArea } from './source-control-commit-area'
export {
  ConflictSummaryCard,
  OperationBanner,
  TooManyChangesBanner
} from './source-control-conflict-summary'
export { ActionButton } from './source-control-empty-state'
export { BRANCH_REFRESH_INTERVAL_MS } from './source-control-panel-constants'
export {
  normalizeSourceControlViewMode,
  pickDefaultSourceControlAgent,
  readCommitDraftForWorktree,
  shouldRenderCommitArea,
  writeCommitDraftForWorktree
} from './source-control-panel-state'
export {
  clearRemoteActionErrorsForCompletedConflictOperations,
  refreshSourceControlAfterRemoteAction
} from './source-control-remote-action-state'
export {
  hasConfiguredCommitMessageGenerationDefaults,
  hasConfiguredSourceControlTextGenerationDefaults
} from './source-control-text-generation-defaults'

function LocalSourceControl({
  isVisible,
  workspacePanelTabId
}: {
  isVisible: boolean
  workspacePanelTabId?: string
}): React.JSX.Element {
  const controller = useSourceControlController({ isVisible, workspacePanelTabId })
  return <SourceControlPanel controller={controller} />
}

function SourceControl({
  source = LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  isVisible = true,
  workspacePanelTabId
}: {
  source?: RightSidebarPanelSource
  isVisible?: boolean
  workspacePanelTabId?: string
}): React.JSX.Element | null {
  if (source.kind === 'spool') {
    return source.supportsGit ? <SpoolGitPane route={source.route} /> : null
  }
  return <LocalSourceControl isVisible={isVisible} workspacePanelTabId={workspacePanelTabId} />
}

export default React.memo(SourceControl)
