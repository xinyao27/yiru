import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { SpoolWorkspaceOperationError } from './spool-workspace-operation'

export function reportSpoolFileMutationError(error: unknown, fallback: string): boolean {
  if (isStaleRouteError(error)) {
    return false
  }
  if (isOutcomeUnknownError(error)) {
    toast.warning(
      translate(
        'auto.components.spool.SpoolFilesPane.outcomeUnknown',
        'This file change may have succeeded on the owner’s worktree. Refresh and inspect the item before making another change.'
      )
    )
    return true
  }
  toast.error(fallback)
  return false
}

export function reportSpoolGitMutationError(error: unknown): boolean {
  if (isStaleRouteError(error)) {
    return false
  }
  if (isOutcomeUnknownError(error)) {
    toast.warning(
      translate(
        'auto.components.spool.SpoolGitPane.outcomeUnknown',
        'This Git action may have succeeded on the owner’s worktree. Refresh and inspect Git state before making another change.'
      )
    )
    return true
  }
  toast.error(
    translate(
      'auto.components.spool.SpoolGitPane.mutationFailed',
      'Could not change this worktree.'
    )
  )
  return false
}

function isStaleRouteError(error: unknown): boolean {
  return error instanceof SpoolWorkspaceOperationError && error.code === 'stale_route'
}

function isOutcomeUnknownError(error: unknown): boolean {
  return error instanceof SpoolWorkspaceOperationError && error.code === 'outcome_unknown'
}
