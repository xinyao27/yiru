import { useSourceControlActionModel } from './source-control-controller-action-model'
import { useSourceControlBranchCompare } from './source-control-controller-branch-compare'
import { useSourceControlBulkActions } from './source-control-controller-bulk-actions'
import { useSourceControlCommitAction } from './source-control-controller-commit-action'
import { useSourceControlCommitGeneration } from './source-control-controller-commit-generation'
import { useSourceControlConflictActions } from './source-control-controller-conflict-actions'
import { useSourceControlCreateReview } from './source-control-controller-create-review'
import { useSourceControlCreateReviewIntent } from './source-control-controller-create-review-intent'
import { useSourceControlCreateReviewPrerequisites } from './source-control-controller-create-review-prerequisites'
import { useSourceControlCreateReviewSubmit } from './source-control-controller-create-review-submit'
import { useSourceControlFileModel } from './source-control-controller-file-model'
import { useSourceControlFileMutations } from './source-control-controller-file-mutations'
import { useSourceControlFileOpen } from './source-control-controller-file-open'
import { useSourceControlHistory } from './source-control-controller-history'
import { useSourceControlHostedReviewState } from './source-control-controller-hosted-review-state'
import { useSourceControlInteractionState } from './source-control-controller-interaction-state'
import { useSourceControlLifecycle } from './source-control-controller-lifecycle'
import { useSourceControlRemoteActions } from './source-control-controller-remote-actions'
import { useSourceControlReviewDialog } from './source-control-controller-review-dialog'
import { useSourceControlReviewGeneration } from './source-control-controller-review-generation'
import { useSourceControlStatusRefresh } from './source-control-controller-status-refresh'
import { useSourceControlStoreState } from './source-control-controller-store-state'

export function useSourceControlController({
  isVisible,
  workspacePanelTabId
}: {
  isVisible: boolean
  workspacePanelTabId?: string
}) {
  const storeState = useSourceControlStoreState({ isVisible, workspacePanelTabId })
  const interactionState = useSourceControlInteractionState(storeState)
  const statusRefresh = useSourceControlStatusRefresh(interactionState)
  const hostedReviewState = useSourceControlHostedReviewState(statusRefresh)
  const fileModel = useSourceControlFileModel(hostedReviewState)
  const lifecycle = useSourceControlLifecycle(fileModel)
  const commitAction = useSourceControlCommitAction(lifecycle)
  const commitGeneration = useSourceControlCommitGeneration(commitAction)
  const remoteActions = useSourceControlRemoteActions(commitGeneration)
  const conflictActions = useSourceControlConflictActions(remoteActions)
  const reviewGeneration = useSourceControlReviewGeneration(conflictActions)
  const reviewDialog = useSourceControlReviewDialog(reviewGeneration)
  const createReview = useSourceControlCreateReview(reviewDialog)
  const createReviewSubmit = useSourceControlCreateReviewSubmit(createReview)
  const createReviewPrerequisites = useSourceControlCreateReviewPrerequisites(createReviewSubmit)
  const createReviewIntent = useSourceControlCreateReviewIntent(createReviewPrerequisites)
  const actionModel = useSourceControlActionModel(createReviewIntent)
  const fileOpen = useSourceControlFileOpen(actionModel)
  const bulkActions = useSourceControlBulkActions(fileOpen)
  const branchCompare = useSourceControlBranchCompare(bulkActions)
  const history = useSourceControlHistory(branchCompare)
  return useSourceControlFileMutations(history)
}

export type SourceControlController = ReturnType<typeof useSourceControlController>
