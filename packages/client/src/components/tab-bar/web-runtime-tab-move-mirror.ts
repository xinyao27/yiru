import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import {
  isWebRuntimeSessionActive,
  moveWebRuntimeSessionTab
} from '~renderer/runtime/web-runtime-session'
import { useAppStore } from '~renderer/store'
import type { RuntimeMobileSessionTabMove } from '~shared/runtime-types'

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
