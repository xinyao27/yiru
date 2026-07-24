import { Check, Pencil, X } from '@phosphor-icons/react'
import { toast } from 'sonner'

import { DetachedHeadBadge } from '@/components/detached-head-badge'
import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { readSourceControlLaunchRecipeAgentId } from '@/lib/source-control-launch-agent-selection'

import { resolveSourceControlActionRecipe } from '../../../../shared/source-control-ai'
import { getBrokenChecks } from '../pr-checks-fix-prompt'
import {
  ConflictingFilesSection,
  MergeConflictNotice,
  ChecksList,
  PRCommentsList,
  PRTriageStrip
} from './checks-panel-content'
import type { useChecksPanelCreateReviewState } from './checks-panel-create-review'
import { ChecksPanelReviewHeader } from './checks-panel-review-header'
import { ChecksPanelUpdatedAtMetadata } from './checks-panel-updated-at-metadata'
import HostedReviewActions from './hosted-review-actions'
import { SourceControlAgentActionDialog } from './source-control-agent-action-dialog'

type ChecksPanelReviewViewProps = { context: useChecksPanelCreateReviewState }

export function ChecksPanelReviewView({
  context
}: ChecksPanelReviewViewProps): React.JSX.Element | null {
  const {
    activeConflictReview,
    activeConnectionId,
    activeGitLabReview,
    activeReview,
    activeSourceControlLaunchPlatform,
    activeWorktree,
    activeWorktreeId,
    agentComposerState,
    aiActionDisabledReason,
    canTargetPRComments,
    checks,
    checksLoading,
    comments,
    commentsDisabledReason,
    commentsLoading,
    commentsSelectionClearRequest,
    conflictDetailsRefreshing,
    detachedHeadDisplay,
    editingTitle,
    handleAddPRComment,
    handleCancelEdit,
    handleFixChecksWithAI,
    handleLinkAnotherPullRequest,
    handleLoadCheckDetails,
    handleOpenPR,
    handleRefresh,
    handleReplyToComment,
    handleResolve,
    handleResolveCommentsWithAI,
    handleResolveConflictsWithAI,
    handleSaveTitle,
    handleStartEdit,
    handleTitleKeyDown,
    handleUnlinkPullRequest,
    isFixingChecksWithAI,
    isRefreshing,
    isResolvingConflictsWithAI,
    linkedPR,
    pr,
    refreshHostedReviewAfterMutation,
    repo,
    resolveCommentsWithAIDisabledReason,
    resolveSelectedThreadsAfterLaunch,
    saveLaunchActionDefault,
    setAgentComposerState,
    setChecksPanelContentRef,
    setTitleDraft,
    settings,
    sourceControlAiActionsVisible,
    stateRequestKey,
    titleDraft,
    titleInputRef,
    titleSaving
  } = context

  if (!activeReview) {
    return null
  }
  const reviewShortLabel = activeReview.provider === 'gitlab' ? 'MR' : 'PR'
  const shouldShowReviewTriageStrip =
    activeConflictReview !== null || getBrokenChecks(checks).length > 0
  // Why: mirror openHttpLink's global routing inputs so the hint only appears
  // when the actual plain-click path would open inside Yiru.
  const showHostedReviewSystemBrowserHint =
    Boolean(activeWorktreeId) &&
    settings?.openLinksInApp === true &&
    !settings.activeRuntimeEnvironmentId
  return (
    <div ref={setChecksPanelContentRef} className="scrollbar-sleek flex-1 overflow-auto">
      {/* Hosted review header */}
      <div className="border-border space-y-2.5 border-b px-3 py-3">
        {/* Review number + state badge + refresh + open link */}
        <ChecksPanelReviewHeader
          review={activeReview}
          isRefreshing={isRefreshing}
          canUnlinkPullRequest={linkedPR !== null}
          showSystemBrowserHint={showHostedReviewSystemBrowserHint}
          onRefresh={() => void handleRefresh()}
          onOpenReview={handleOpenPR}
          onUnlinkPullRequest={handleUnlinkPullRequest}
          onLinkAnotherPullRequest={handleLinkAnotherPullRequest}
        />

        {detachedHeadDisplay && <DetachedHeadBadge display={detachedHeadDisplay} side="bottom" />}

        {/* Review title */}
        {editingTitle ? (
          <div className="flex items-center gap-1">
            <Input
              ref={titleInputRef}
              size="xs"
              className="flex-1"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              disabled={titleSaving}
            />
            <Button
              variant="ghost"
              size="xs"
              className="focus-visible:bg-accent h-auto border-0 p-1 text-emerald-500 transition-colors hover:text-emerald-400 focus-visible:text-emerald-400 disabled:cursor-default"
              title={translate('auto.components.right.sidebar.ChecksPanel.2ab7fd4b6d', 'Save')}
              onClick={() => void handleSaveTitle()}
              disabled={titleSaving}
            >
              {titleSaving ? (
                <LoadingIndicator className="size-3.5" />
              ) : (
                <Check className="size-3.5" />
              )}
            </Button>
            <Button
              variant="quiet"
              size="xs"
              className="h-auto border-0 p-1 disabled:cursor-default"
              title={translate('auto.components.right.sidebar.ChecksPanel.058039787c', 'Cancel')}
              onClick={handleCancelEdit}
              disabled={titleSaving}
            >
              <X weight="regular" className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div
            className="group/title hover:bg-accent/40 -mx-1 flex cursor-pointer items-start gap-1.5 px-1 py-0.5 transition-colors"
            onClick={handleStartEdit}
          >
            <span className="text-foreground flex-1 text-[12px] leading-snug">
              {activeReview.title}
            </span>
            <Pencil className="text-muted-foreground/40 can-hover:opacity-0 mt-0.5 size-3 shrink-0 transition-opacity group-hover/title:opacity-100" />
          </div>
        )}

        {/* Updated at */}
        {activeReview.updatedAt && (
          <ChecksPanelUpdatedAtMetadata
            reviewShortLabel={reviewShortLabel}
            updatedAt={activeReview.updatedAt}
          />
        )}
        {/* Merge / Delete Workspace actions */}
        {activeReview && activeWorktree && repo && (
          <HostedReviewActions
            review={activeReview}
            githubPR={pr}
            repo={repo}
            worktree={activeWorktree}
            onRefreshReview={refreshHostedReviewAfterMutation}
          />
        )}
      </div>

      {shouldShowReviewTriageStrip && sourceControlAiActionsVisible && (
        <PRTriageStrip
          review={activeConflictReview ?? activeReview}
          reviewKind={reviewShortLabel}
          checks={checks}
          isResolvingConflictsWithAI={isResolvingConflictsWithAI}
          onResolveConflictsWithAI={() => void handleResolveConflictsWithAI()}
          resolveConflictsDisabled={Boolean(aiActionDisabledReason)}
          resolveConflictsDisabledReason={aiActionDisabledReason}
          isFixingChecksWithAI={isFixingChecksWithAI}
          onFixChecksWithAI={() => void handleFixChecksWithAI()}
          fixChecksDisabled={Boolean(aiActionDisabledReason)}
          fixChecksDisabledReason={aiActionDisabledReason}
        />
      )}
      {activeConflictReview && (
        <>
          {/* Why: the triage strip owns the single Resolve action for PR and MR
              conflicts; the file list and fallback notice are informational. */}
          <ConflictingFilesSection pr={activeConflictReview} />
          <MergeConflictNotice
            pr={activeConflictReview}
            isRefreshingConflictDetails={isRefreshing || conflictDetailsRefreshing}
          />
        </>
      )}
      {/* Why: when the hosted review has merge conflicts and no checks have been fetched,
          showing "No checks configured" is misleading — checks may exist but
          simply cannot run until conflicts are resolved. Hide the empty state. */}
      {!(activeConflictReview && checks.length === 0 && !checksLoading) && (
        <ChecksList
          checks={checks}
          checksLoading={checksLoading}
          checkDetailsContextKey={stateRequestKey}
          onLoadCheckDetails={handleLoadCheckDetails}
        />
      )}
      <PRCommentsList
        comments={comments}
        commentsLoading={commentsLoading}
        reviewKind={reviewShortLabel}
        commentsDisabled={!canTargetPRComments}
        commentsDisabledReason={commentsDisabledReason}
        selectionContextKey={stateRequestKey}
        selectionClearRequest={commentsSelectionClearRequest}
        resolveCommentsWithAIDisabled={Boolean(resolveCommentsWithAIDisabledReason)}
        resolveCommentsWithAIDisabledReason={resolveCommentsWithAIDisabledReason}
        onAddComment={pr ? handleAddPRComment : undefined}
        onResolveSelectedCommentsWithAI={
          sourceControlAiActionsVisible ? handleResolveCommentsWithAI : undefined
        }
        onReply={pr ? handleReplyToComment : undefined}
        onResolve={pr || activeGitLabReview ? handleResolve : undefined}
      />
      <SourceControlAgentActionDialog
        open={sourceControlAiActionsVisible && agentComposerState !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAgentComposerState(null)
          }
        }}
        actionId={agentComposerState?.actionId ?? 'fixChecks'}
        title={
          agentComposerState?.title ??
          translate('auto.components.right.sidebar.ChecksPanel.7fad8509fe', 'Fix With AI')
        }
        description={agentComposerState?.description ?? ''}
        baseCommandInput={agentComposerState?.prompt ?? ''}
        worktreeId={activeWorktreeId}
        groupId={activeWorktreeId}
        connectionId={activeConnectionId}
        repoId={repo?.id ?? null}
        promptDelivery="submit-after-ready"
        launchPlatform={activeSourceControlLaunchPlatform}
        launchSource={agentComposerState?.launchSource ?? 'task_page'}
        savedAgentId={
          agentComposerState
            ? readSourceControlLaunchRecipeAgentId(
                resolveSourceControlActionRecipe({
                  settings,
                  repo,
                  actionId: agentComposerState.actionId
                })
              )
            : null
        }
        savedCommandInputTemplate={
          agentComposerState
            ? (resolveSourceControlActionRecipe({
                settings,
                repo,
                actionId: agentComposerState.actionId
              }).commandInputTemplate ?? null)
            : null
        }
        savedAgentArgs={
          agentComposerState
            ? (resolveSourceControlActionRecipe({
                settings,
                repo,
                actionId: agentComposerState.actionId
              }).agentArgs ?? null)
            : null
        }
        onSaveAgentDefault={saveLaunchActionDefault}
        onLaunched={() => {
          const launchedState = agentComposerState
          if (launchedState?.actionId === 'resolveComments' && launchedState.commentResolution) {
            void resolveSelectedThreadsAfterLaunch(launchedState.commentResolution).catch((err) => {
              console.warn('Failed to resolve selected review comments after AI launch:', err)
              toast.error(
                translate(
                  'auto.components.right.sidebar.ChecksPanel.495b2f8c4b',
                  'Started the agent, but could not mark the selected comments resolved.'
                )
              )
            })
          } else if (launchedState?.actionId === 'resolveConflicts') {
            toast.success(
              translate(
                'auto.components.right.sidebar.ChecksPanel.a0181a8d76',
                'Started an AI agent for the conflicts.'
              )
            )
          } else {
            toast.success(
              translate(
                'auto.components.right.sidebar.ChecksPanel.2ef90c9819',
                'Started an AI agent for the broken checks.'
              )
            )
          }
        }}
      />
    </div>
  )
}
