import React from 'react'

import { GitHistoryPanel } from './git-history-panel'
import type { SourceControlController } from './source-control-controller'

type SourceControlHistorySectionProps = {
  controller: SourceControlController
}

function SourceControlHistorySection({
  controller
}: SourceControlHistorySectionProps): React.JSX.Element | null {
  const {
    collapsedSections,
    gitHistoryState,
    handleCommitAction,
    isGitHistoryVisible,
    loadCommitFiles,
    openCommitFile,
    openHistoryCommitDiff,
    refreshGitHistory,
    toggleSection
  } = controller

  if (!isGitHistoryVisible) {
    return null
  }

  // Why: history is reference context for the whole panel and stays docked at the bottom.
  return (
    <div className="border-border bg-sidebar sticky bottom-0 z-10 mt-auto shrink-0 border-t">
      <GitHistoryPanel
        state={gitHistoryState}
        collapsed={collapsedSections.has('history')}
        onToggle={() => toggleSection('history')}
        onRefresh={() => void refreshGitHistory()}
        onOpenCommit={(item) => void openHistoryCommitDiff(item)}
        onLoadCommitFiles={loadCommitFiles}
        onOpenCommitFile={openCommitFile}
        onCommitAction={handleCommitAction}
      />
    </div>
  )
}

// Why: `controller` is rebuilt every render by the 21-hook chain in
// source-control-controller.tsx, so a default shallow compare on the prop
// never bails. Compare only the fields this component actually reads —
// verified against the destructure and JSX above, and this component passes
// specific extracted props to GitHistoryPanel rather than forwarding the
// whole controller, so a missed field can't hide a stale downstream read
// either. If a future edit reads a new field off `controller` here, add it
// below too.
function areSourceControlHistorySectionPropsEqual(
  prev: SourceControlHistorySectionProps,
  next: SourceControlHistorySectionProps
): boolean {
  const a = prev.controller
  const b = next.controller
  return (
    a.collapsedSections === b.collapsedSections &&
    a.gitHistoryState === b.gitHistoryState &&
    a.handleCommitAction === b.handleCommitAction &&
    a.isGitHistoryVisible === b.isGitHistoryVisible &&
    a.loadCommitFiles === b.loadCommitFiles &&
    a.openCommitFile === b.openCommitFile &&
    a.openHistoryCommitDiff === b.openHistoryCommitDiff &&
    a.refreshGitHistory === b.refreshGitHistory &&
    a.toggleSection === b.toggleSection
  )
}

export const SourceControlHistorySectionMemo = React.memo(
  SourceControlHistorySection,
  areSourceControlHistorySectionPropsEqual
)
