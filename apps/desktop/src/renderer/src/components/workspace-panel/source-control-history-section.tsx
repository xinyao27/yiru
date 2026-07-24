import { GitHistoryPanel } from './git-history-panel'
import type { SourceControlController } from './source-control-controller'

export function SourceControlHistorySection({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element | null {
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
