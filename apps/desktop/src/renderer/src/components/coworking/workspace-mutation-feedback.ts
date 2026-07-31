import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'

import { CoworkingWorkspaceOperationError } from './workspace-operation'

export function reportCoworkingFileMutationError(error: unknown, fallback: string): boolean {
  if (isStaleRouteError(error)) {
    return false
  }
  if (isOutcomeUnknownError(error)) {
    toast.warning(
      translate(
        'auto.components.coworking.CoworkingFilesPane.outcomeUnknown',
        'This file change may have succeeded on the owner’s worktree. Refresh and inspect the item before making another change.'
      )
    )
    return true
  }
  toast.error(fallback)
  return false
}

export function reportCoworkingGitMutationError(error: unknown): boolean {
  if (isStaleRouteError(error)) {
    return false
  }
  if (isOutcomeUnknownError(error)) {
    toast.warning(
      translate(
        'auto.components.coworking.CoworkingGitPane.outcomeUnknown',
        'This Git action may have succeeded on the owner’s worktree. Refresh and inspect Git state before making another change.'
      )
    )
    return true
  }
  toast.error(
    translate(
      'auto.components.coworking.CoworkingGitPane.mutationFailed',
      'Could not change this worktree.'
    )
  )
  return false
}

function isStaleRouteError(error: unknown): boolean {
  return error instanceof CoworkingWorkspaceOperationError && error.code === 'stale_route'
}

function isOutcomeUnknownError(error: unknown): boolean {
  return error instanceof CoworkingWorkspaceOperationError && error.code === 'outcome_unknown'
}
