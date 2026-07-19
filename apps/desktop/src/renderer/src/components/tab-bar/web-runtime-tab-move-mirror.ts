import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'

import type { RuntimeMobileSessionTabMove } from '../../../../shared/runtime-types'
import {
  isWebRuntimeSessionActive,
  moveWebRuntimeSessionTab
} from '../../runtime/web-runtime-session'
import { useAppStore } from '../../store'

export function mirrorWebRuntimeTabMove(
  args: RuntimeMobileSessionTabMove & {
    worktreeId: string
  }
): void {
  const environmentId = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), args.worktreeId)
  if (!isWebRuntimeSessionActive(environmentId)) {
    return
  }
  void moveWebRuntimeSessionTab({
    ...args,
    environmentId
  })
}
