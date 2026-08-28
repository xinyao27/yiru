import type { RuntimeWorktreeCreateProgressEvent } from '@yiru/runtime-protocol/contract'
import { translate } from '~renderer/i18n/i18n'
import { getCreationProgressLabel } from '~renderer/worktree-creation/pending'

export function worktreeCreationNotification(event: RuntimeWorktreeCreateProgressEvent): {
  message: string
  progress: number
  title: string
} {
  return {
    message: getCreationProgressLabel({ indeterminate: false, phase: event.phase }),
    progress: worktreeCreationPercent(event.phase),
    title: translate('extension.operationProgress.worktreeTitle', 'Creating workspace')
  }
}

function worktreeCreationPercent(phase: RuntimeWorktreeCreateProgressEvent['phase']): number {
  switch (phase) {
    case 'preparing':
      return 5
    case 'fetching':
      return 15
    case 'creating':
      return 35
    case 'copying-files':
      return 55
    case 'checking-setup':
      return 70
    case 'running-setup':
      return 82
    case 'starting-workspace':
      return 100
  }
}
