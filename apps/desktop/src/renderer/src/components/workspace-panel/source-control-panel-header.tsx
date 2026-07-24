import {
  Check,
  Copy,
  DotsThree as MoreHorizontal,
  CaretDown as ChevronDown,
  Chat as MessageSquare,
  Trash as Trash2
} from '@phosphor-icons/react'

import { DetachedHeadBadge } from '@/components/detached-head-badge'
import { DiffNotesSendMenu } from '@/components/editor/diff-notes-send-menu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { SourceControlController } from './source-control-controller'
import { DiffCommentsInlineList } from './source-control-diff-comments-inline-list'
import { SourceControlHeaderToolbar } from './source-control-header-toolbar'

export function SourceControlPanelHeader({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element {
  const {
    activeGroupId,
    activeTabId,
    activeWorktreeId,
    branchSummary,
    compareBaseRef,
    deleteDiffComment,
    detachedHeadDisplay,
    diffCommentCount,
    diffCommentsCopied,
    diffCommentsExpanded,
    diffCommentsForActive,
    filterExpanded,
    filterQuery,
    handleCopyDiffComments,
    handleCreatePrHeaderClick,
    handleOpenComment,
    handleToggleSourceControlViewMode,
    hostedReview,
    isCreatePrIntentInFlight,
    isCreatingPr,
    isVisible,
    manualReviewUrl,
    openHostedReviewInChecks,
    prGenerating,
    refreshBranchCompare,
    remoteStatus,
    setBaseRefDialogOpen,
    setDiffCommentsExpanded,
    setFilterExpanded,
    setFilterQuery,
    setPendingDiffCommentsClear,
    settings,
    sourceControlViewMode,
    visibleCreatePrHeaderAction,
    workspacePanelTabId,
    worktreePath
  } = controller

  return (
    <>
      <SourceControlHeaderToolbar
        filterQuery={filterQuery}
        filterExpanded={filterExpanded}
        onFilterQueryChange={setFilterQuery}
        onFilterExpandedChange={setFilterExpanded}
        visibleCreatePrHeaderAction={visibleCreatePrHeaderAction}
        hostedReview={hostedReview}
        isCreatePrIntentInFlight={isCreatePrIntentInFlight}
        isCreatingPr={isCreatingPr || prGenerating}
        onCreatePrHeaderClick={handleCreatePrHeaderClick}
        onOpenHostedReviewInChecks={openHostedReviewInChecks}
        sourceControlViewMode={sourceControlViewMode}
        viewModeToggleDisabled={settings === null}
        onToggleViewMode={handleToggleSourceControlViewMode}
        onChangeBaseRef={() => setBaseRefDialogOpen(true)}
        onRefreshBranchCompare={() => void refreshBranchCompare()}
        branchCompareRefreshDisabled={!branchSummary || branchSummary.status === 'loading'}
        diffCommentCount={diffCommentCount}
        onExpandNotes={() => setDiffCommentsExpanded(true)}
        branchSummary={branchSummary}
        compareBaseRef={compareBaseRef}
        upstreamStatus={remoteStatus}
        manualReviewUrl={manualReviewUrl}
      />

      {detachedHeadDisplay ? (
        <div className="border-border border-b px-3 py-2">
          <DetachedHeadBadge display={detachedHeadDisplay} side="bottom" />
        </div>
      ) : null}

      {activeWorktreeId && worktreePath && diffCommentCount > 0 ? (
        <div className="border-border border-b">
          <div className="flex items-center gap-1 py-1.5 pr-2 pl-3">
            <Button
              variant="quiet"
              size="xs"
              type="button"
              className="flex h-auto min-w-0 flex-1 justify-start gap-1.5 border-0 p-0 text-left font-normal whitespace-normal"
              onClick={() => setDiffCommentsExpanded((previous) => !previous)}
              aria-expanded={diffCommentsExpanded}
              title={
                diffCommentsExpanded
                  ? translate(
                      'auto.components.right.sidebar.SourceControl.d13edef890',
                      'Collapse notes'
                    )
                  : translate(
                      'auto.components.right.sidebar.SourceControl.72f2bea3f4',
                      'Expand notes'
                    )
              }
            >
              <ChevronDown
                weight="regular"
                className={cn(
                  'size-3 shrink-0 transition-transform',
                  !diffCommentsExpanded && '-rotate-90'
                )}
              />
              <MessageSquare className="size-3.5 shrink-0" />
              <span>
                {translate('auto.components.right.sidebar.SourceControl.cc474e0b8c', 'Notes')}
              </span>
              <span className="text-muted-foreground text-[11px] leading-none tabular-nums">
                {diffCommentCount}
              </span>
            </Button>
            <div className="ml-1 flex shrink-0 items-center gap-1.5">
              <DiffNotesSendMenu
                worktreeId={activeWorktreeId}
                groupId={activeGroupId ?? activeWorktreeId}
                comments={diffCommentsForActive}
                triggerClassName="size-6"
                // Why: only the focused split tab may consume the global shortcut request.
                respondToOpenRequest={
                  isVisible && (!workspacePanelTabId || workspacePanelTabId === activeTabId)
                }
              />
              <TooltipProvider delay={400}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="quiet"
                        size="icon-xs"
                        type="button"
                        onClick={() => void handleCopyDiffComments()}
                        aria-label={translate(
                          'auto.components.right.sidebar.SourceControl.3baf6c77b4',
                          'Copy all notes to clipboard'
                        )}
                      >
                        {diffCommentsCopied ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                    }
                  />
                  <TooltipContent side="bottom" sideOffset={6}>
                    {translate(
                      'auto.components.right.sidebar.SourceControl.eae2d051af',
                      'Copy all notes'
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenu>
                <TooltipProvider delay={400}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="quiet"
                              size="icon-xs"
                              type="button"
                              aria-label={translate(
                                'auto.components.right.sidebar.SourceControl.2fe2a67580',
                                'More note actions'
                              )}
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          }
                        />
                      }
                    />
                    <TooltipContent side="bottom" sideOffset={6}>
                      {translate(
                        'auto.components.right.sidebar.SourceControl.2fe2a67580',
                        'More note actions'
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() =>
                      setPendingDiffCommentsClear({ kind: 'all', worktreeId: activeWorktreeId })
                    }
                  >
                    <Trash2 className="size-3.5" />
                    {translate(
                      'auto.components.right.sidebar.SourceControl.1406954883',
                      'Clear all notes...'
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {diffCommentsExpanded ? (
            <DiffCommentsInlineList
              comments={diffCommentsForActive}
              onDelete={(id) => void deleteDiffComment(activeWorktreeId, id)}
              onOpen={handleOpenComment}
              onClearFile={(filePath) =>
                setPendingDiffCommentsClear({
                  kind: 'file',
                  worktreeId: activeWorktreeId,
                  filePath
                })
              }
            />
          ) : null}
        </div>
      ) : null}
    </>
  )
}
